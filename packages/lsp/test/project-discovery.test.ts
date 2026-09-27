import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectDiscovery } from "../src/project-discovery.js";

let temp: string;
let workspace: string;
const resolvers: ProjectDiscovery[] = [];

function file(...segments: string[]): string {
  return join(workspace, ...segments);
}

function uri(...segments: string[]): string {
  return pathToFileURL(file(...segments)).href;
}

function write(relativePath: string, contents: string): void {
  const destination = file(relativePath);
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(destination, contents);
}

function resolver(...roots: string[]): ProjectDiscovery {
  const discovery = new ProjectDiscovery(roots);
  resolvers.push(discovery);
  return discovery;
}

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "shdr-lsp-discovery-")));
  workspace = join(temp, "workspace");
  mkdirSync(workspace);
  // The outer project includes files from alpha as well; nearest config wins.
  write("tsconfig.json", JSON.stringify({ include: ["**/*.shdr.ts"] }));
  write("root.shdr.ts", "export const root = 1;\n");
  write("alpha/tsconfig.json", JSON.stringify({ include: ["shader.shdr.ts"] }));
  write("alpha/shader.shdr.ts", "export const alpha = 1;\n");
  write("alpha/excluded.shdr.ts", "export const excluded = 1;\n");
  write("alpha/ordinary.ts", "export const ordinary = 1;\n");
  write("beta/tsconfig.json", JSON.stringify({ include: ["*.shdr.ts"] }));
  write("beta/shader.shdr.ts", "export const beta = 1;\n");
});

afterEach(() => {
  for (const discovery of resolvers.splice(0)) discovery.dispose();
  rmSync(temp, { recursive: true, force: true });
});

describe("Phase 1 project selection (not yet connected to LSP)", () => {
  it("selects the nearest containing config for two projects from root or nested workspace", () => {
    const root = resolver(workspace);
    const alpha = root.select(uri("alpha", "shader.shdr.ts"));
    expect(alpha).toEqual({
      status: "project",
      configPath: file("alpha", "tsconfig.json"),
      filePath: file("alpha", "shader.shdr.ts"),
      workspaceRoot: workspace,
    });
    expect(root.select(uri("beta", "shader.shdr.ts"))).toMatchObject({
      status: "project",
      configPath: file("beta", "tsconfig.json"),
    });
    expect(root.select(uri("root.shdr.ts"))).toMatchObject({
      status: "project",
      configPath: file("tsconfig.json"),
    });

    const nested = resolver(file("alpha"));
    expect(nested.select(uri("alpha", "shader.shdr.ts"))).toEqual({
      ...alpha,
      workspaceRoot: file("alpha"),
    });
    expect(nested.select(uri("beta", "shader.shdr.ts"))).toMatchObject({
      status: "outside-workspace",
    });
    // Overlapping folders choose the deepest containing root.
    expect(
      resolver(workspace, file("alpha")).select(uri("alpha", "shader.shdr.ts")),
    ).toMatchObject({
      status: "project",
      workspaceRoot: file("alpha"),
    });
    const separate = join(temp, "separate");
    mkdirSync(separate);
    writeFileSync(
      join(separate, "tsconfig.json"),
      JSON.stringify({ include: ["*.shdr.ts"] }),
    );
    writeFileSync(
      join(separate, "shader.shdr.ts"),
      "export const separate = 1;\n",
    );
    expect(
      resolver(workspace, separate).select(
        pathToFileURL(join(separate, "shader.shdr.ts")).href,
      ),
    ).toMatchObject({
      status: "project",
      workspaceRoot: separate,
      configPath: join(separate, "tsconfig.json"),
    });
  });

  it("chooses the nearest ancestor that includes the shader, without crossing the worktree root", () => {
    expect(
      resolver(workspace).select(uri("alpha", "excluded.shdr.ts")),
    ).toMatchObject({
      status: "project",
      configPath: file("tsconfig.json"),
    });
    expect(
      resolver(file("alpha")).select(uri("alpha", "excluded.shdr.ts")),
    ).toMatchObject({
      status: "excluded",
      configPath: file("alpha", "tsconfig.json"),
    });
    write("tsconfig.json", JSON.stringify({ include: ["root.shdr.ts"] }));
    expect(
      resolver(workspace).select(uri("alpha", "excluded.shdr.ts")),
    ).toEqual({
      status: "excluded",
      configPath: file("alpha", "tsconfig.json"),
      message: `No tsconfig.json within ${workspace} includes ${file("alpha", "excluded.shdr.ts")}; nearest is ${file("alpha", "tsconfig.json")}.`,
    });
  });

  it("reports invalid configuration instead of treating parsed file names as valid", () => {
    write(
      "alpha/tsconfig.json",
      '{"compilerOptions":{"notAnOption":true},"include":["*.shdr.ts"]}',
    );
    const selection = resolver(workspace).select(
      uri("alpha", "shader.shdr.ts"),
    );
    expect(selection).toMatchObject({
      status: "invalid-config",
      configPath: file("alpha", "tsconfig.json"),
      codes: [5023],
    });
    expect(selection).toHaveProperty(
      "message",
      expect.stringContaining("Unknown compiler option 'notAnOption'"),
    );
    write("alpha/tsconfig.json", "{ invalid");
    expect(
      resolver(workspace).select(uri("alpha", "shader.shdr.ts")),
    ).toMatchObject({
      status: "invalid-config",
      configPath: file("alpha", "tsconfig.json"),
      codes: expect.arrayContaining([1005]),
    });
  });

  it("has explicit missing-config and missing/unsaved-file states", () => {
    const isolated = join(temp, "isolated");
    mkdirSync(isolated);
    writeFileSync(join(isolated, "shader.shdr.ts"), "export const x = 1;\n");
    expect(
      resolver(isolated).select(
        pathToFileURL(join(isolated, "shader.shdr.ts")).href,
      ),
    ).toEqual({
      status: "no-config",
      message: `No tsconfig.json found for ${join(isolated, "shader.shdr.ts")} within ${isolated}.`,
    });
    expect(
      resolver(workspace).select(uri("alpha", "new.shdr.ts")),
    ).toMatchObject({
      status: "not-on-disk",
      message: expect.stringContaining("Save "),
    });
    write("root-only/shader.shdr.ts", "export const nested = 1;\n");
    // A workspace rooted below a config does not search beyond its boundary.
    expect(
      resolver(file("root-only")).select(uri("root-only", "shader.shdr.ts")),
    ).toMatchObject({
      status: "no-config",
    });
    expect(
      resolver(workspace).select(uri("root-only", "shader.shdr.ts")),
    ).toMatchObject({
      status: "project",
      configPath: file("tsconfig.json"),
    });
  });

  it("does not traverse references or check ordinary/non-file documents", () => {
    write(
      "solution/tsconfig.json",
      JSON.stringify({ files: [], references: [{ path: "../beta" }] }),
    );
    write("solution/shader.shdr.ts", "export const shader = 1;\n");
    write("tsconfig.json", JSON.stringify({ include: ["root.shdr.ts"] }));
    const discovery = resolver(workspace);
    expect(discovery.select(uri("solution", "shader.shdr.ts"))).toMatchObject({
      status: "excluded",
      configPath: file("solution", "tsconfig.json"),
    });
    expect(discovery.select(uri("alpha", "ordinary.ts"))).toEqual({
      status: "ignored",
    });
    expect(discovery.select("untitled:shader.shdr.ts")).toEqual({
      status: "ignored",
    });
    expect(discovery.select("not a uri")).toEqual({ status: "ignored" });
  });

  it("uses canonical paths for symlinks, rejects targets/configs outside the worktree", () => {
    const other = join(temp, "other.shdr.ts");
    writeFileSync(other, "export const other = 1;\n");
    symlinkSync(file("alpha", "shader.shdr.ts"), file("alias.shdr.ts"));
    symlinkSync(other, file("external.shdr.ts"));
    const discovery = resolver(workspace);
    expect(discovery.select(uri("alias.shdr.ts"))).toMatchObject({
      status: "project",
      configPath: file("alpha", "tsconfig.json"),
      filePath: realpathSync(file("alpha", "shader.shdr.ts")),
    });
    expect(discovery.select(uri("external.shdr.ts"))).toMatchObject({
      status: "outside-workspace",
    });
    expect(discovery.select(pathToFileURL(other).href)).toMatchObject({
      status: "outside-workspace",
    });
    const outsideConfig = join(temp, "tsconfig.json");
    writeFileSync(outsideConfig, JSON.stringify({ include: ["*.shdr.ts"] }));
    rmSync(file("alpha", "tsconfig.json"));
    symlinkSync(outsideConfig, file("alpha", "tsconfig.json"));
    expect(discovery.select(uri("alpha", "shader.shdr.ts"))).toMatchObject({
      status: "invalid-config",
      configPath: file("alpha", "tsconfig.json"),
    });
    rmSync(file("alpha", "tsconfig.json"));
    symlinkSync(
      join(temp, "missing-tsconfig.json"),
      file("alpha", "tsconfig.json"),
    );
    expect(discovery.select(uri("alpha", "shader.shdr.ts"))).toMatchObject({
      status: "invalid-config",
      configPath: file("alpha", "tsconfig.json"),
    });
  });

  it("re-evaluates a config on later selects instead of caching stale membership", () => {
    const discovery = resolver(workspace);
    expect(discovery.select(uri("alpha", "excluded.shdr.ts"))).toMatchObject({
      status: "project",
      configPath: file("tsconfig.json"),
    });
    write("alpha/tsconfig.json", JSON.stringify({ include: ["*.shdr.ts"] }));
    expect(discovery.select(uri("alpha", "excluded.shdr.ts"))).toMatchObject({
      status: "project",
      configPath: file("alpha", "tsconfig.json"),
    });
  });
});

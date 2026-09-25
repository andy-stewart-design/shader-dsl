import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkShaderPaths } from "../src/check.js";
import { CliInputError } from "../src/contract.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = resolve(packageRoot, "../..");
const executable = join(packageRoot, "dist/bin.mjs");
const fixtureRoot = join(packageRoot, "test/fixtures");

async function withProject(
  test: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "shdr-cli-integration-"));
  try {
    await test(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function fixture(
  cwd: string,
  name: string,
  target = name,
): Promise<void> {
  const destination = join(cwd, target);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(fixtureRoot, name), destination);
}

function invoke(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("installed executable", () => {
  it("checks valid shaders from another working directory without checking ordinary TS", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "valid.shdr.ts", "folder with spaces/valid.shdr.ts");
      const result = invoke(cwd, "check");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        "Checked 1 shader file: no Shdr diagnostics.\n",
      );
      expect(result.stderr).toBe("");
      expect(
        invoke(cwd, "check", "folder with spaces/valid.shdr.ts").stdout,
      ).toBe("Checked 1 shader file: no Shdr diagnostics.\n");
      await fixture(cwd, "valid.shdr.ts", "another.shdr.ts");
      expect(invoke(cwd, "check").stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );
    });
  });

  it("reports boundary, syntax, and semantic failures across files in path order", async () => {
    await withProject(async (cwd) => {
      for (const [source, target] of [
        ["semantic.shdr.ts", "z.shdr.ts"],
        ["unsupported.shdr.ts", "b.shdr.ts"],
        ["nested.shdr.ts", "nested/n.shdr.ts"],
        ["bad-boundary.shdr.ts", "a.shdr.ts"],
      ]) {
        await fixture(cwd, source!, target!);
      }
      const result = invoke(cwd, "check");
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines).toHaveLength(4);
      expect(lines[0]).toMatch(/^a\.shdr\.ts:1:1: SHDR1005: /);
      expect(lines[1]).toMatch(/^b\.shdr\.ts:4:14: SHDR1103: /);
      expect(lines[2]).toMatch(/^nested\/n\.shdr\.ts:4:14: SHDR1205: /);
      expect(lines[3]).toMatch(/^z\.shdr\.ts:4:14: SHDR1205: /);
      expect(result.stdout).not.toContain("__shdr_internal_");
    });
  });

  it("prints every diagnostic returned for a single source in source order", async () => {
    await withProject(async (cwd) => {
      await writeFile(
        join(cwd, "imports.shdr.ts"),
        'import { createFragmentShader, brokenA, brokenB } from "shdr";\n',
      );
      const result = invoke(cwd, "check");
      expect(result.status).toBe(1);
      expect(result.stdout.trimEnd().split("\n")).toEqual([
        expect.stringMatching(/^imports\.shdr\.ts:1:32: SHDR1007: /),
        expect.stringMatching(/^imports\.shdr\.ts:1:41: SHDR1007: /),
      ]);
    });
  });

  it("preserves original UTF-16 offsets, including CRLF and characters outside the BMP", async () => {
    await withProject(async (cwd) => {
      const source = await readFile(
        join(fixtureRoot, "semantic.shdr.ts"),
        "utf8",
      );
      await writeFile(
        join(cwd, "emoji.shdr.ts"),
        `// 🎨\r\n${source.replace("  const uv =", "  /*🎨*/ const uv =").replaceAll("\n", "\r\n")}`,
      );
      const result = invoke(cwd, "check", "emoji.shdr.ts");
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/^emoji\.shdr\.ts:5:21: SHDR1205: /);
    });
  });

  it("fails closed for no matches, invalid paths/options, and non-shader files", async () => {
    await withProject(async (cwd) => {
      await writeFile(join(cwd, "ordinary.ts"), "const value = 1;\n");
      for (const args of [
        ["check"],
        ["check", "missing"],
        ["check", "ordinary.ts"],
        ["check", "--invalid"],
        ["compile"],
      ]) {
        const result = invoke(cwd, ...args);
        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toMatch(/^shdr: /);
      }
      expect(invoke(cwd, "check", "missing").stderr).toContain("ENOENT");
      const help = invoke(cwd, "check", "--help");
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("shdr check [paths...]");
    });
  });

  it("respects default ignores while accepting explicit ignored files", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "valid.shdr.ts", "src/valid.shdr.ts");
      await fixture(cwd, "semantic.shdr.ts", "dist/semantic.shdr.ts");
      await fixture(cwd, "semantic.shdr.ts", "test/fixtures/semantic.shdr.ts");
      expect(invoke(cwd, "check").stdout).toBe(
        "Checked 1 shader file: no Shdr diagnostics.\n",
      );
      expect(invoke(cwd, "check", "dist/semantic.shdr.ts").status).toBe(1);
      expect(invoke(cwd, "check", "test/fixtures").status).toBe(1);
    });
  });

  it("is reachable through the root workspace script", () => {
    const result = spawnSync("pnpm", ["shdr", "check"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /Checked [1-9]\d* shader files?: no Shdr diagnostics\./,
    );
    expect(result.stderr).not.toContain("shdr: ");
  });
});

describe("checker API", () => {
  it("does not return partial diagnostics when reading another file fails", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "semantic.shdr.ts", "a.shdr.ts");
      await fixture(cwd, "valid.shdr.ts", "b.shdr.ts");
      await expect(
        checkShaderPaths(["a.shdr.ts", "b.shdr.ts"], cwd, async (file) => {
          if (file.endsWith("b.shdr.ts")) {
            throw Object.assign(new Error("Permission denied"), {
              code: "EACCES",
            });
          }
          return readFile(file, "utf8");
        }),
      ).rejects.toThrow(CliInputError);
      const result = await checkShaderPaths(["a.shdr.ts", "b.shdr.ts"], cwd);
      expect(result.outcome).toBe("diagnostics");
      expect(result.fileCount).toBe(2);
      expect(result.lines).toHaveLength(1);
    });
  });
});

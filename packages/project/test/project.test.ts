import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { checkShaderGraph } from "@shdr/core";
import { compileFragmentArtifact } from "@shdr/core/browser";

import { loadShaderGraph, selectProject } from "../src/index.js";

async function withProject(
  test: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "shdr-project-"));
  try {
    await test(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("shared shader project loader", () => {
  it("uses inherited paths and loads only reachable aliased files", async () => {
    await withProject(async (root) => {
      await mkdir(join(root, "app/src"), { recursive: true });
      await mkdir(join(root, "shared"), { recursive: true });
      await writeFile(
        join(root, "base.json"),
        JSON.stringify({
          compilerOptions: {
            paths: { "@shader/*": ["./shared/*.shdr.ts"] },
          },
        }),
      );
      await writeFile(
        join(root, "app/tsconfig.json"),
        JSON.stringify({
          extends: "../base.json",
          compilerOptions: { noEmit: true },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      const entry = join(root, "app/src/scene.shdr.ts");
      const helper = join(root, "shared/math.shdr.ts");
      await writeFile(
        entry,
        'import { helper } from "@shader/math";\nexport default helper;\n',
      );
      await writeFile(helper, "export const helper = 1;\n");
      await writeFile(join(root, "unrelated.shdr.ts"), "export const x = 1;\n");

      const loaded = await loadShaderGraph({
        entry,
        searchRoots: [join(root, "app")],
      });
      expect(loaded.project.status).toBe("project");
      expect([...loaded.input.files.keys()]).toEqual(
        expect.arrayContaining([await realpath(entry), await realpath(helper)]),
      );
      expect(loaded.input.files).not.toHaveProperty(
        join(root, "unrelated.shdr.ts"),
      );
      expect(loaded.input.paths?.["@shader/*"]).toEqual([
        join(await realpath(root), "shared/*.shdr.ts").replaceAll("\\", "/"),
      ]);
    });
  });

  it("loads defining-file module constants and refreshes invalid helper edits", async () => {
    await withProject(async (root) => {
      await mkdir(join(root, "src"), { recursive: true });
      const entry = join(root, "src/entry.shdr.ts");
      const helper = join(root, "src/helper.shdr.ts");
      const helperSource = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const SCALE = 0.5;
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`;
      await writeFile(
        entry,
        `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(scale(uniforms.time), 0, 0, 1));
`,
      );
      await writeFile(helper, helperSource);
      const loaded = await loadShaderGraph({ entry, searchRoots: [root] });
      const compiled = compileFragmentArtifact(loaded.input);
      expect(compiled.ok).toBe(true);
      if (compiled.ok) {
        expect(compiled.artifact.glsl).toContain("0.5");
        expect(compiled.artifact.glsl).not.toContain("SCALE");
      }
      expect([...loaded.input.files.keys()]).toContain(await realpath(helper));

      await writeFile(
        helper,
        helperSource.replace("const SCALE = 0.5;", "const SCALE = hostScale;"),
      );
      const edited = await loadShaderGraph({ entry, searchRoots: [root] });
      const diagnostics = checkShaderGraph(edited.input);
      expect(diagnostics.ok).toBe(false);
      if (!diagnostics.ok)
        expect(diagnostics.diagnostics[0]).toMatchObject({
          code: "SHDR1108",
          fileName: await realpath(helper),
        });
    });
  });

  it("compiles derivative helper graphs with stable resources and source-owned edit errors", async () => {
    await withProject(async (root) => {
      await mkdir(join(root, "src/shared"), { recursive: true });
      const entry = join(root, "src/entry.shdr.ts");
      const helper = join(root, "src/shared/derivatives.shdr.ts");
      const helperSource = `import { defineShaderFunction, dFdx, fwidth } from "shdr";
import type { Expr, F32 } from "shdr";
export const slope = defineShaderFunction((value: Expr<F32>) => fwidth(dFdx(value)));
`;
      const entrySource = `import { defineUniforms, sample, vec4 } from "shdr";
import { slope } from "./shared/derivatives.shdr.ts";
export default defineUniforms((u) => ({ tint: u.vec3(0.5, 0.7, 0.9), photo: u.texture2D("/photo.png") }))
  .createFragmentShader(({ coord, uniforms }) => {
    const color = sample(uniforms.photo, coord.xy / uniforms.resolution);
    return vec4(color.x * uniforms.tint.x + slope(coord.x), color.y, color.z, 1);
  });
`;
      await writeFile(entry, entrySource);
      await writeFile(helper, helperSource);
      const loaded = await loadShaderGraph({ entry, searchRoots: [root] });
      expect([...loaded.input.files.keys()]).toContain(await realpath(helper));
      const compiled = compileFragmentArtifact(loaded.input);
      expect(compiled.ok).toBe(true);
      if (compiled.ok) {
        expect(compiled.artifact.glsl).toContain("dFdx(");
        expect(compiled.artifact.wgsl).toContain("dpdx(");
        expect(
          compiled.artifact.custom.declarations.map((item) => item.name),
        ).toEqual(["tint"]);
        expect(compiled.artifact.resources?.textures[0]?.url).toBe(
          "/photo.png",
        );
        expect(Object.keys(compiled.artifact)).toEqual([
          "glsl",
          "wgsl",
          "defaults",
          "custom",
          "resources",
        ]);
      }

      const invalidHelper = helperSource.replace(
        "dFdx(value)",
        "dFdx(value, value)",
      );
      await writeFile(helper, invalidHelper);
      const invalid = await loadShaderGraph({ entry, searchRoots: [root] });
      const diagnostics = checkShaderGraph(invalid.input);
      expect(diagnostics.ok).toBe(false);
      if (!diagnostics.ok) {
        expect(diagnostics.diagnostics[0]).toMatchObject({
          code: "SHDR1208",
          fileName: await realpath(helper),
          range: {
            start: invalidHelper.indexOf("dFdx(value, value)"),
          },
        });
      }
      expect(compileFragmentArtifact(invalid.input).ok).toBe(false);
    });
  });

  it("canonicalizes symlinked alias targets for the core graph", async () => {
    await withProject(async (root) => {
      const realLibrary = join(root, "library");
      const linkedLibrary = join(root, "linked-library");
      await mkdir(realLibrary, { recursive: true });
      await symlink("library", linkedLibrary, "dir");
      await writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            paths: { "@shader/*": ["./linked-library/*.shdr.ts"] },
          },
          include: ["scene.shdr.ts"],
        }),
      );
      const entry = join(root, "scene.shdr.ts");
      const helper = join(realLibrary, "helper.shdr.ts");
      await writeFile(
        entry,
        `import { createFragmentShader, vec4 } from "shdr";
import { helper } from "@shader/helper";
export default createFragmentShader(({ uniforms }) => vec4(helper(0.5)));`,
      );
      await writeFile(
        helper,
        `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const helper = defineShaderFunction((x: Expr<F32>) => x);`,
      );

      const loaded = await loadShaderGraph({
        entry,
        searchRoots: [root],
      });
      expect(loaded.input.paths?.["@shader/*"]).toEqual([
        `${await realpath(realLibrary)}/*.shdr.ts`,
      ]);
      expect(checkShaderGraph(loaded.input)).toMatchObject({
        ok: true,
        diagnostics: [],
      });

      const equivalentVirtualGraph = {
        entry: await realpath(entry),
        files: new Map([
          [await realpath(entry), await readFile(entry, "utf8")],
          [await realpath(helper), await readFile(helper, "utf8")],
        ]),
        paths: loaded.input.paths,
      };
      expect(compileFragmentArtifact(loaded.input)).toEqual(
        compileFragmentArtifact(equivalentVirtualGraph),
      );

      const invalidHelper = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const helper = defineShaderFunction((x: Expr<F32>) => x + true);`;
      await writeFile(helper, invalidHelper);
      const invalidLoaded = await loadShaderGraph({
        entry,
        searchRoots: [root],
      });
      const invalidVirtualGraph = {
        ...equivalentVirtualGraph,
        files: new Map([
          [await realpath(entry), await readFile(entry, "utf8")],
          [await realpath(helper), invalidHelper],
        ]),
      };
      const projectDiagnostics = checkShaderGraph(invalidLoaded.input);
      const virtualDiagnostics = checkShaderGraph(invalidVirtualGraph);
      expect(projectDiagnostics).toEqual(virtualDiagnostics);
      expect(projectDiagnostics.ok).toBe(false);
      if (!projectDiagnostics.ok)
        expect(projectDiagnostics.diagnostics[0]?.fileName).toBe(
          await realpath(helper),
        );
    });
  });

  it("does not borrow aliases from an excluded project and permits external relative dependencies", async () => {
    await withProject(async (root) => {
      const scenes = join(root, "external/scenes");
      const lib = join(root, "external/lib");
      await mkdir(scenes, { recursive: true });
      await mkdir(lib, { recursive: true });
      const entry = join(scenes, "scene.shdr.ts");
      const helper = join(lib, "helper.shdr.ts");
      await writeFile(
        entry,
        'import { helper } from "../lib/helper.shdr.ts";\n',
      );
      await writeFile(helper, "export const helper = 1;\n");
      await writeFile(
        join(scenes, "other.shdr.ts"),
        "export const other = 1;\n",
      );
      await writeFile(
        join(scenes, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { paths: { "@shader/*": ["../lib/*.shdr.ts"] } },
          include: ["other.shdr.ts"],
        }),
      );
      const selection = selectProject(entry, [scenes]);
      expect(selection.status).toBe("excluded");
      const loaded = await loadShaderGraph({ entry, searchRoots: [scenes] });
      expect(loaded.project.paths).toEqual({});
      expect([...loaded.input.files.keys()]).toEqual([
        await realpath(entry),
        await realpath(helper),
      ]);
    });
  });
});

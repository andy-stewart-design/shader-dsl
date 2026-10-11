import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { build } from "vite";
import type { Plugin } from "vite";
import { compileFragmentArtifact } from "@shdr/core/browser";

import shdr, { vitePackageName } from "../src/index.js";

describe("@shdr/vite package", () => {
  it("exports its package marker", () => {
    expect(vitePackageName).toBe("@shdr/vite");
  });

  it("creates a pre-transform plugin", () => {
    expect(shdr()).toMatchObject({
      name: "shdr",
      enforce: "pre",
    });
  });

  it.each([
    "/src/ordinary.ts",
    "/src/component.shdr.tsx",
    "/src/shader.shdr.ts/child",
  ])("ignores the non-shader module %s", async (id) => {
    expect(await transform(shdr(), "export {};", id)).toBeNull();
  });

  it("compiles shader IDs with Vite query strings to JavaScript", async () => {
    const source = targetSource();
    const result = await transform(
      shdr(),
      source,
      "/src/gradient.shdr.ts?import&t=123#fragment",
    );
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.map).toBeNull();
    expect(result.code).toMatch(/^export default \{/);
    expect(result.code).not.toContain('from \\"shdr\\"');
    expect(result.code).not.toContain("createFragmentShader");

    const generated = JSON.parse(
      result.code.slice("export default ".length, -";\n".length),
    ) as {
      glsl: string;
      wgsl: string;
      defaults: { glsl: string[]; wgsl: string[] };
    };
    expect(generated.glsl).toMatch(/^#version 300 es/);
    expect(generated.glsl).toContain("shdr_fragment_color");
    expect(generated.wgsl).toContain("shdr_fragment_main");
    expect(generated.defaults).toEqual({
      glsl: ["resolution"],
      wgsl: ["resolution"],
    });
    expect(generated.glsl).not.toContain('from "shdr"');
    expect(generated.glsl).not.toContain("coord.xy / uniforms.resolution");
    const compiled = compileFragmentArtifact(source);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) expect(generated).toEqual(compiled.artifact);
  });

  it("pre-transforms ceil, distance and cross to generated GLSL", async () => {
    const source = readFileSync(
      new URL(
        "../../../apps/editor-fixture/geometry-math.shdr.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const result = await transform(
      shdr(),
      source,
      "/src/geometry-math.shdr.ts",
    );
    expect(result).not.toBeNull();
    if (!result) return;
    const generated = JSON.parse(
      result.code.slice("export default ".length, -";\n".length),
    ) as { glsl: string; wgsl: string };
    expect(generated.glsl).toContain("ceil(");
    expect(generated.glsl).toContain("distance(");
    expect(generated.glsl).toContain("cross(");
    expect(generated.wgsl).toContain("cross(");
  });

  it("emits identical static and browser artifacts for both custom-uniform forms", async () => {
    const inline = readFileSync(
      new URL(
        "../../../apps/vite-basic/src/custom-uniforms.shdr.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const named = `import { createFragmentShader, defineUniforms, vec4 } from "shdr";
const uniforms = defineUniforms((u) => ({ color: u.vec3(0, 0, 1), dpi: u.f32(12) }));
export default createFragmentShader(({ uniforms }) => vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, 1), { uniforms });`;
    for (const source of [inline, named]) {
      const transformed = await transform(
        shdr(),
        source,
        "/src/custom.shdr.ts",
      );
      expect(transformed).not.toBeNull();
      if (!transformed) continue;
      expect(transformed.code).not.toContain("defineUniforms");
      const staticArtifact = JSON.parse(
        transformed.code.slice("export default ".length, -";\n".length),
      );
      const browser = compileFragmentArtifact(source);
      expect(browser.ok).toBe(true);
      if (browser.ok) expect(staticArtifact).toEqual(browser.artifact);
      expect(staticArtifact.custom.declarations).toHaveLength(2);
      expect(staticArtifact.wgsl).toContain("@group(1) @binding(0)");
    }
  });

  it("compiles aliased imported helpers and schemas and watches their sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "shdr-vite-graph-"));
    try {
      const sourceDirectory = join(root, "src");
      await mkdir(sourceDirectory, { recursive: true });
      await writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            paths: { "@shader/*": ["./src/*.shdr.ts"] },
          },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      const entry = join(sourceDirectory, "entry.shdr.ts");
      await writeFile(
        join(sourceDirectory, "helper.shdr.ts"),
        `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const helper = defineShaderFunction((x: Expr<F32>) => x);`,
      );
      await writeFile(
        join(sourceDirectory, "schema.shdr.ts"),
        `import { defineUniforms } from "shdr";
export const uniforms = defineUniforms((u) => ({ gain: u.f32(0.5) }));`,
      );
      const source = `import { createFragmentShader, vec4 } from "shdr";
import { helper } from "@shader/helper";
import { uniforms } from "@shader/schema";
export default createFragmentShader(({ uniforms }) => vec4(helper(uniforms.gain)), { uniforms });`;
      await writeFile(entry, source);
      const plugin = shdr();
      configure(plugin, root);
      const watched: string[] = [];
      const result = await transform(plugin, source, entry, watched);
      expect(result).not.toBeNull();
      expect(watched.sort()).toEqual(
        [
          await realpath(join(sourceDirectory, "helper.shdr.ts")),
          await realpath(join(sourceDirectory, "schema.shdr.ts")),
        ].sort(),
      );
      const artifact = parseArtifact(result);
      expect(artifact.custom?.declarations).toEqual([
        { name: "gain", type: "f32", default: 0.5 },
      ]);
      expect(artifact.glsl).toContain("shdr_internal_fn_0");
      expect(artifact.wgsl).toContain("fn shdr_internal_fn_0");

      await writeFile(
        join(sourceDirectory, "schema.shdr.ts"),
        `import { defineUniforms } from "shdr";
export const uniforms = defineUniforms((u) => ({ gain: u.f32(0.75) }));`,
      );
      const edited = await transform(plugin, source, entry);
      const editedArtifact = parseArtifact(edited);
      expect(editedArtifact.custom?.declarations).toEqual([
        { name: "gain", type: "f32", default: 0.75 },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("attributes dependency faults to the dependency and rejects direct helper runtime imports", async () => {
    const root = await mkdtemp(join(tmpdir(), "shdr-vite-errors-"));
    try {
      const entry = join(root, "entry.shdr.ts");
      const helper = join(root, "helper.shdr.ts");
      const validHelper = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const helper = defineShaderFunction((x: Expr<F32>) => x);`;
      await writeFile(
        helper,
        `import { defineShaderFunction, sqrt } from "shdr";
import type { Expr, F32 } from "shdr";
export const helper = defineShaderFunction((x: Expr<F32>) => sqrt(-1));`,
      );
      const source = `import { createFragmentShader, vec4 } from "shdr";
import { helper } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(helper(uniforms.time)));`;
      await writeFile(entry, source);
      const plugin = shdr();
      configure(plugin, root);
      let thrown: unknown;
      try {
        await transform(plugin, source, entry);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(helper),
        pluginCode: "SHDR1209",
      });

      let directImportError: unknown;
      try {
        await transform(plugin, validHelper, helper);
      } catch (error) {
        directImportError = error;
      }
      expect(directImportError).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(helper),
        pluginCode: "SHDR1008",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects named helper imports from an ordinary host Vite build", async () => {
    const fixtureRoot = fileURLToPath(new URL("./fixtures/", import.meta.url));
    const outputDirectory = await mkdtemp(join(tmpdir(), "shdr-vite-host-"));
    let thrown: unknown;
    try {
      await build({
        root: fixtureRoot,
        logLevel: "silent",
        plugins: [shdr()],
        build: {
          outDir: outputDirectory,
          emptyOutDir: true,
          rollupOptions: {
            input: fileURLToPath(
              new URL("./fixtures/host-named-import.ts", import.meta.url),
            ),
          },
        },
      });
    } catch (error) {
      thrown = error;
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
    expect(thrown).toBeDefined();
    expect(String(thrown)).toContain("SHDR1008");
    expect(String(thrown)).toContain("helper.shdr.ts");
  });

  it("reports a source-located Vite error for a dynamic uniform default", async () => {
    const source = readFileSync(
      new URL(
        "../../../apps/vite-basic/src/custom-uniforms.shdr.ts",
        import.meta.url,
      ),
      "utf8",
    ).replace("u.f32(12)", "u.f32(window.devicePixelRatio)");
    const expected = locationAt(
      source,
      source.indexOf("window.devicePixelRatio"),
    );
    let thrown: unknown;
    try {
      await transform(shdr(), source, "/src/custom-uniforms.shdr.ts");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "ShdrCompileError",
      pluginCode: "SHDR1210",
      loc: { file: "/src/custom-uniforms.shdr.ts", ...expected },
    });
  });

  it("reports f32-overflowing literals at the authored Vite source range", async () => {
    const source = shaderSource("return vec4(1e300, 0, 0, 1);");
    let thrown: unknown;
    try {
      await transform(shdr(), source, "/src/overflow.shdr.ts");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "ShdrCompileError",
      pluginCode: "SHDR1211",
      loc: {
        file: "/src/overflow.shdr.ts",
        ...locationAt(source, source.indexOf("1e300")),
      },
    });
  });

  it("throws a source-located Vite error for an invalid shader", async () => {
    const expression = "coord.xy + coord.xyz";
    const source = shaderSource(`return vec4(${expression});`);
    const expected = locationAt(source, source.indexOf(expression));

    let thrown: unknown;
    try {
      await transform(shdr(), source, "/src/invalid.shdr.ts?raw");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "ShdrCompileError",
      id: "/src/invalid.shdr.ts",
      pluginCode: "SHDR1205",
      message:
        'SHDR1205: Operator "+" cannot be applied to types "Expr<Vec2<F32>>" and "Expr<Vec3<F32>>".',
      loc: {
        file: "/src/invalid.shdr.ts",
        line: expected.line,
        column: expected.column,
      },
    });
  });
});

interface TransformResult {
  readonly code: string;
  readonly map: null;
}

async function transform(
  plugin: Plugin,
  source: string,
  id: string,
  watched: string[] = [],
): Promise<TransformResult | null> {
  const hook = plugin.transform;
  if (!hook) throw new Error("Expected the plugin to expose transform().");
  const handler = typeof hook === "function" ? hook : hook.handler;
  const context = {
    addWatchFile(fileName: string) {
      watched.push(fileName);
    },
    error(error: unknown): never {
      throw error;
    },
  };

  return (await Reflect.apply(handler, context, [
    source,
    id,
  ])) as TransformResult | null;
}

function configure(plugin: Plugin, root: string): void {
  const hook = plugin.configResolved;
  if (!hook) throw new Error("Expected the plugin to expose configResolved().");
  const handler = typeof hook === "function" ? hook : hook.handler;
  Reflect.apply(handler, plugin, [{ root }]);
}

function parseArtifact(result: TransformResult | null): {
  readonly glsl: string;
  readonly wgsl: string;
  readonly custom?: {
    readonly declarations: readonly unknown[];
  };
} {
  expect(result).not.toBeNull();
  if (!result) throw new Error("Expected a transformed artifact.");
  return JSON.parse(result.code.slice("export default ".length, -";\n".length));
}

function targetSource(): string {
  return shaderSource(`const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);
  return color;`);
}

function shaderSource(body: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});
`;
}

function locationAt(
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const preceding = source.slice(0, offset).split("\n");
  return {
    line: preceding.length,
    column: preceding.at(-1)?.length ?? 0,
  };
}

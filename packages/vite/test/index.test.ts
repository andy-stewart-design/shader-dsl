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

  it.each([
    ["/", "/photo.png"],
    ["/nested/", "/nested/photo.png"],
    ["./", "./photo.png"],
  ] as const)(
    "adapts public texture URLs for base %s",
    async (base, expected) => {
      const source = textureSource("/photo.png");
      const plugin = shdr();
      configure(plugin, process.cwd(), base);
      const result = await transform(plugin, source, "/src/texture.shdr.ts");
      const artifact = parseArtifact(result);
      expect(artifact.resources?.textures[0]?.url).toBe(expected);
      const standalone = compileFragmentArtifact(source);
      expect(standalone.ok).toBe(true);
      if (standalone.ok)
        expect(standalone.artifact.resources?.textures[0]?.url).toBe(
          "/photo.png",
        );
    },
  );

  it("preserves HTTPS texture URLs when applying a Vite base", async () => {
    const source = textureSource("https://cdn.example/photo.png");
    const plugin = shdr();
    configure(plugin, process.cwd(), "/nested/");
    const artifact = parseArtifact(
      await transform(plugin, source, "/src/texture.shdr.ts"),
    );
    expect(artifact.resources?.textures[0]?.url).toBe(
      "https://cdn.example/photo.png",
    );
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

  it("pre-transforms derivative helper graphs and recovers from invalid helper edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "shdr-vite-derivatives-"));
    try {
      const sourceDirectory = join(root, "src");
      const sharedDirectory = join(sourceDirectory, "shared");
      await mkdir(sharedDirectory, { recursive: true });
      const helper = join(sharedDirectory, "derivatives.shdr.ts");
      const entry = join(sourceDirectory, "entry.shdr.ts");
      const helperSource = `import { defineShaderFunction, dFdx, dFdy, fwidth } from "shdr";
import type { Expr, F32 } from "shdr";
export const slope = defineShaderFunction((value: Expr<F32>) => fwidth(dFdy(dFdx(value))));
`;
      const entrySource = `import { defineUniforms, sample, vec4 } from "shdr";
import { slope } from "./shared/derivatives.shdr.ts";
export default defineUniforms((u) => ({ tint: u.vec3(0.5, 0.7, 0.9), photo: u.texture2D("/photo.png") }))
  .createFragmentShader(({ coord, uniforms }) => {
    const color = sample(uniforms.photo, coord.xy / uniforms.resolution);
    return vec4(color.x * uniforms.tint.x + slope(coord.x), color.y, color.z, 1);
  });
`;
      await writeFile(helper, helperSource);
      await writeFile(entry, entrySource);
      const plugin = shdr();
      configure(plugin, root);
      const watched: string[] = [];
      const transformed = await transform(plugin, entrySource, entry, watched);
      const artifact = parseArtifact(transformed);
      expect(transformed?.map).toBeNull();
      expect(artifact.glsl).toContain("dFdx(");
      expect(artifact.glsl).toContain("(-dFdy(");
      expect(artifact.glsl).toContain("fwidth(");
      expect(artifact.wgsl).toContain("dpdx(");
      expect(artifact.wgsl).toContain("dpdy(");
      expect(artifact.resources?.textures[0]?.url).toBe("/photo.png");
      const custom = artifact.custom;
      expect(custom).toBeDefined();
      if (!custom) throw new Error("Expected custom uniform metadata.");
      expect(custom.declarations.map((item) => item.name)).toEqual(["tint"]);
      expect(watched).toContain(await realpath(helper));
      expect(transformed?.code).not.toContain("defineShaderFunction");
      expect(transformed?.code).not.toContain("createFragmentShader");

      await writeFile(
        helper,
        helperSource.replace("dFdx(value)", "dFdx(value, value)"),
      );
      let invalid: unknown;
      try {
        await transform(plugin, entrySource, entry);
      } catch (error) {
        invalid = error;
      }
      expect(invalid).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(helper),
        pluginCode: "SHDR1208",
      });

      await writeFile(
        helper,
        helperSource.replace("dFdx(value)", "dFdx(value * 2)"),
      );
      const recovered = parseArtifact(
        await transform(plugin, entrySource, entry),
      );
      expect(recovered.glsl).toContain("dFdx(");
      expect(recovered.wgsl).toContain("dpdx(");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("compiles module constants through helper edits and rejects static isolation violations", async () => {
    const root = await mkdtemp(join(tmpdir(), "shdr-vite-constants-"));
    try {
      const sourceDirectory = join(root, "src");
      await mkdir(sourceDirectory, { recursive: true });
      const helper = join(sourceDirectory, "helper.shdr.ts");
      const entry = join(sourceDirectory, "entry.shdr.ts");
      const helperSource = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const SCALE = 0.5;
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`;
      const entrySource = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(scale(uniforms.time), 0, 0, 1));
`;
      await writeFile(helper, helperSource);
      await writeFile(entry, entrySource);
      const plugin = shdr();
      configure(plugin, root);
      const watched: string[] = [];
      const initial = parseArtifact(
        await transform(plugin, entrySource, entry, watched),
      );
      expect(initial.glsl).toContain("0.5");
      expect(initial.glsl).not.toContain("SCALE");
      expect(watched).toContain(await realpath(helper));

      await writeFile(
        helper,
        helperSource.replace("const SCALE = 0.5;", "const SCALE = 0.75;"),
      );
      const edited = parseArtifact(await transform(plugin, entrySource, entry));
      expect(edited.glsl).toContain("0.75");

      await writeFile(
        helper,
        helperSource.replace("const SCALE = 0.5;", "const SCALE = hostScale;"),
      );
      let invalidHelper: unknown;
      try {
        await transform(plugin, entrySource, entry);
      } catch (error) {
        invalidHelper = error;
      }
      expect(invalidHelper).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(helper),
        pluginCode: "SHDR1108",
      });

      const constants = join(sourceDirectory, "constants.shdr.ts");
      await writeFile(constants, "export const VALUE = 0.25;\n");
      const importedSource = `import { createFragmentShader, vec4 } from "shdr";
import { VALUE } from "./constants.shdr.ts";
export default createFragmentShader(() => vec4(VALUE, 0, 0, 1));
`;
      await writeFile(entry, importedSource);
      let imported: unknown;
      try {
        await transform(plugin, importedSource, entry);
      } catch (error) {
        imported = error;
      }
      expect(imported).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(entry),
        pluginCode: "SHDR1108",
      });

      const defaultSource = `import { createFragmentShader, defineUniforms, vec4 } from "shdr";
const GAIN = 0.5;
const uniforms = defineUniforms((u) => ({ gain: u.f32(GAIN) }));
export default createFragmentShader(({ uniforms }) => vec4(uniforms.gain), { uniforms });
`;
      await writeFile(entry, defaultSource);
      let invalidDefault: unknown;
      try {
        await transform(plugin, defaultSource, entry);
      } catch (error) {
        invalidDefault = error;
      }
      expect(invalidDefault).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(entry),
        pluginCode: "SHDR1210",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
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

  it("compiles the complete matrix vocabulary through an imported Vite graph without runtime fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "shdr-vite-matrices-"));
    try {
      const sourceDirectory = join(root, "src");
      await mkdir(sourceDirectory, { recursive: true });
      const helper = join(sourceDirectory, "matrices.shdr.ts");
      const entry = join(sourceDirectory, "entry.shdr.ts");
      await writeFile(
        helper,
        `import { defineShaderFunction, mat2, mat3, mat4 } from "shdr";
import type { Expr, F32, Mat3 } from "shdr";
export const diagonal2 = defineShaderFunction((value: Expr<F32>) => mat2(value));
export const copy3 = defineShaderFunction((value: Expr<Mat3<F32>>): Expr<Mat3<F32>> => mat3(value));
export const diagonal4 = defineShaderFunction((value: Expr<F32>) => mat4(value));
`,
      );
      const source = `import { createFragmentShader, mat2, mat3, mat4, vec2, vec3, vec4 } from "shdr";
import { copy3, diagonal2, diagonal4 } from "./matrices.shdr.ts";
export default createFragmentShader(({ uniforms }) => {
  const m2 = diagonal2(uniforms.time); const m3 = copy3(mat3(uniforms.time)); const m4 = diagonal4(uniforms.time);
  const f2 = mat2(uniforms.time, uniforms.time, uniforms.time, uniforms.time); const c2 = mat2(vec2(uniforms.time), vec2(uniforms.time)); const x2 = mat2(m2);
  const f3 = mat3(uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time); const c3 = mat3(vec3(uniforms.time), vec3(uniforms.time), vec3(uniforms.time)); const x3 = mat3(m3);
  const f4 = mat4(uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time); const c4 = mat4(vec4(uniforms.time), vec4(uniforms.time), vec4(uniforms.time), vec4(uniforms.time)); const x4 = mat4(m4);
  const a = m2 + f2; const b = m2 - f2; const c = m2 * uniforms.time; const d = uniforms.time * m2; const e = m2 * vec2(uniforms.time); const f = vec2(uniforms.time) * m2; const g = m2 * f2;
  const h = m3 + f3; const i = m3 - f3; const j = m3 * uniforms.time; const k = uniforms.time * m3; const l = m3 * vec3(uniforms.time); const n = vec3(uniforms.time) * m3; const o = m3 * f3;
  const p = m4 + f4; const q = m4 - f4; const r = m4 * uniforms.time; const s = uniforms.time * m4; const t = m4 * vec4(uniforms.time); const u = vec4(uniforms.time) * m4; const v = m4 * f4;
  return vec4(e.x + f.x, l.x + n.x, t.x + u.x, 1);
});
`;
      await writeFile(entry, source);
      const plugin = shdr();
      configure(plugin, root);
      const watched: string[] = [];
      const transformed = await transform(plugin, source, entry, watched);
      const artifact = parseArtifact(transformed);
      expect(watched).toContain(await realpath(helper));
      expect(Object.keys(artifact).sort()).toEqual([
        "defaults",
        "glsl",
        "wgsl",
      ]);
      expect(artifact.glsl).toContain("mat2");
      expect(artifact.glsl).toContain("shdr_internal_fn_");
      expect(artifact.wgsl).toContain("mat4x4<f32>");
      expect(artifact.glsl).not.toContain("createFragmentShader");
      expect(artifact.wgsl).not.toContain("defineShaderFunction");

      const changed = source.replace(
        "copy3(mat3(uniforms.time))",
        "copy3(mat2(uniforms.time))",
      );
      const changedCall = "copy3(mat2(uniforms.time))";
      const changedLocation = locationAt(changed, changed.indexOf(changedCall));
      await writeFile(entry, changed);
      let thrown: unknown;
      try {
        await transform(plugin, changed, entry);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: "ShdrCompileError",
        id: await realpath(entry),
        pluginCode: "SHDR1213",
        loc: { file: await realpath(entry), ...changedLocation },
      });
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

function configure(plugin: Plugin, root: string, base = "/"): void {
  const hook = plugin.configResolved;
  if (!hook) throw new Error("Expected the plugin to expose configResolved().");
  const handler = typeof hook === "function" ? hook : hook.handler;
  Reflect.apply(handler, plugin, [{ root, base }]);
}

function parseArtifact(result: TransformResult | null): {
  readonly glsl: string;
  readonly wgsl: string;
  readonly custom?: {
    readonly declarations: readonly { readonly name: string }[];
  };
  readonly resources?: {
    readonly textures: readonly { readonly url: string }[];
  };
} {
  expect(result).not.toBeNull();
  if (!result) throw new Error("Expected a transformed artifact.");
  return JSON.parse(result.code.slice("export default ".length, -";\n".length));
}

function textureSource(url: string): string {
  return `import { defineUniforms, sample, vec2 } from "shdr";

export default defineUniforms((u) => ({ photo: u.texture2D(${JSON.stringify(url)}) }))
  .createFragmentShader(({ uniforms }) => sample(uniforms.photo, vec2(0, 0)));
`;
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

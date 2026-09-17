import { describe, expect, it } from "vitest";
import type { Plugin } from "vite";

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
    expect(result.code).toMatch(/^export default "/);
    expect(result.code).not.toContain('from \\"shdr\\"');
    expect(result.code).not.toContain("createFragmentShader");

    const generated = JSON.parse(
      result.code.slice("export default ".length, -";\n".length),
    ) as string;
    expect(generated).toMatch(/^#version 300 es/);
    expect(generated).toContain("shdr_fragment_color");
    expect(generated).not.toContain('from "shdr"');
    expect(generated).not.toContain("coord.xy / uniforms.resolution");
  });

  it("throws a source-located Vite error for an invalid shader", async () => {
    const expression = "coord.x + uniforms.time";
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
      pluginCode: "SHDR1105",
      message:
        'SHDR1105: The "+" binary operator is not supported; the POC supports only division.',
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
): Promise<TransformResult | null> {
  const hook = plugin.transform;
  if (!hook) throw new Error("Expected the plugin to expose transform().");
  const handler = typeof hook === "function" ? hook : hook.handler;
  const context = {
    error(error: unknown): never {
      throw error;
    },
  };

  return (await Reflect.apply(handler, context, [source, id])) as
    | TransformResult
    | null;
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

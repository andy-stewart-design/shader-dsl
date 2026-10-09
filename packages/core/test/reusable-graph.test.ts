import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/browser.js";
import { ShaderDiagnosticCode } from "../src/index.js";
import type { ShaderVirtualGraphInput } from "../src/index.js";

const math = `import { defineShaderFunction, fract } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
export const ramp = defineShaderFunction((p: Expr<Vec2<F32>>, seed: Expr<F32>) =>
  fract(p.x * 0.1031 + p.y * 0.11369 + seed),
);`;
const shared = `import { defineShaderFunction } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
import { ramp as base } from "./math.shdr.ts";
export const grain = defineShaderFunction((p: Expr<Vec2<F32>>, seed: Expr<F32>) => base(p, seed));`;
const mixedShared = `${shared.replace(
  'import { defineShaderFunction } from "shdr";',
  'import { createFragmentShader, defineShaderFunction, vec4 } from "shdr";',
)}\nexport default createFragmentShader(({ uniforms }) => vec4(0, 0, 0, 1));`;
const entry = `import { createFragmentShader, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
import { grain } from "./shared.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => vec4(grain(coord.xy, uniforms.time)));`;

function graph(
  overrides: Partial<ShaderVirtualGraphInput> = {},
): ShaderVirtualGraphInput {
  return {
    entry: "/work/scene.shdr.ts",
    files: {
      "/work/scene.shdr.ts": entry,
      "/work/shared.shdr.ts": shared,
      "/work/math.shdr.ts": math,
    },
    ...overrides,
  };
}

describe("virtual shader module graph", () => {
  it("lowers transitive named helper imports and emits only reachable helpers", () => {
    const result = compileFragmentArtifact(graph());
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(
      result.artifact.glsl.match(/(?:float|vec[234]) shdr_internal_fn_\d+\(/g),
    ).toHaveLength(2);
    expect(
      result.artifact.wgsl.match(/fn shdr_internal_fn_\d+\(/g),
    ).toHaveLength(2);
    expect(result.artifact.glsl).toContain("u_time");
  });

  it("accepts a mixed helper/default module without emitting its default fragment", () => {
    const result = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": entry,
          "/work/shared.shdr.ts": mixedShared,
          "/work/math.shdr.ts": math,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.glsl.match(/void main\(\)/g)).toHaveLength(1);
  });

  it("ignores an unused dependency default body but validates the entry default body", () => {
    const invalidDependency = mixedShared.replace(
      "vec4(0, 0, 0, 1)",
      "uniforms.time % 2",
    );
    const dependencyResult = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": entry,
          "/work/shared.shdr.ts": invalidDependency,
          "/work/math.shdr.ts": math,
        },
      }),
    );
    expect(
      dependencyResult.ok,
      JSON.stringify(dependencyResult.diagnostics),
    ).toBe(true);

    const invalidEntry = entry.replace(
      "vec4(grain(coord.xy, uniforms.time))",
      "uniforms.time % 2",
    );
    const entryResult = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": invalidEntry,
          "/work/shared.shdr.ts": shared,
          "/work/math.shdr.ts": math,
        },
      }),
    );
    expect(entryResult.ok).toBe(false);
    if (!entryResult.ok)
      expect(entryResult.diagnostics[0]?.code).toBe(
        ShaderDiagnosticCode.UnsupportedOperator,
      );
  });

  it("does not fall through from a matching exact alias to a wildcard", () => {
    const aliasedEntry = entry.replace(
      '"./shared.shdr.ts"',
      '"@shader/shared"',
    );
    const result = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": aliasedEntry,
          "/work/wildcard/shared.shdr.ts": shared,
          "/work/math.shdr.ts": math,
        },
        paths: {
          "@shader/shared": ["/work/exact/shared.shdr.ts"],
          "@shader/*": ["/work/wildcard/*.shdr.ts"],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.MissingShaderModule,
        fileName: "/work/scene.shdr.ts",
      });
      expect(
        aliasedEntry.slice(
          result.diagnostics[0]!.range.start,
          result.diagnostics[0]!.range.start +
            result.diagnostics[0]!.range.length,
        ),
      ).toBe('"@shader/shared"');
    }
  });

  it("uses the supplied effective paths mapping", () => {
    const aliasedEntry = entry.replace(
      '"./shared.shdr.ts"',
      '"@shader/shared"',
    );
    const result = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": aliasedEntry,
          "/work/shared.shdr.ts": shared,
          "/work/math.shdr.ts": math,
        },
        paths: { "@shader/*": ["/work/*.shdr.ts"] },
      }),
    );
    const relative = compileFragmentArtifact(graph());
    expect(result).toEqual(relative);
  });

  it("attributes missing modules and exports to the import source", () => {
    const missing = compileFragmentArtifact(
      graph({
        files: { "/work/scene.shdr.ts": entry, "/work/shared.shdr.ts": shared },
      }),
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.MissingShaderModule,
      fileName: "/work/shared.shdr.ts",
    });
    expect(missing.diagnostics[0]!.range.start).toBe(
      shared.indexOf('"./math.shdr.ts"'),
    );

    const absentSource = entry.replaceAll("grain", "missing");
    const absent = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": absentSource,
          "/work/shared.shdr.ts": shared,
          "/work/math.shdr.ts": math,
        },
      }),
    );
    expect(absent.ok).toBe(false);
    if (absent.ok) return;
    expect(absent.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.MissingShaderExport,
      fileName: "/work/scene.shdr.ts",
    });
  });

  it("is deterministic with frozen virtual inputs", () => {
    const input = graph();
    Object.freeze(input.files);
    const first = compileFragmentArtifact(input);
    const second = compileFragmentArtifact(input);
    expect(first).toEqual(second);
  });

  it("compiles graph-generated GLSL and WGSL with real target compilers", async () => {
    const result = compileFragmentArtifact(graph());
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--enable-webgl",
        "--enable-unsafe-swiftshader",
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
      ],
    });
    try {
      const page = await browser.newPage();
      await page.route("http://localhost/", (route) =>
        route.fulfill({ body: "<!doctype html><canvas></canvas>" }),
      );
      await page.goto("http://localhost/");
      const compiled = await page.evaluate(async (artifact) => {
        const gl = document.querySelector("canvas")?.getContext("webgl2");
        if (!gl)
          return {
            available: false as const,
            reason: "Blocked: WebGL 2 is unavailable",
          };
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter)
          return {
            available: false as const,
            reason: "Blocked: WebGPU adapter is unavailable",
          };
        const device = await adapter.requestDevice();
        try {
          const vertex = gl.createShader(gl.VERTEX_SHADER)!;
          gl.shaderSource(
            vertex,
            "#version 300 es\nvoid main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }",
          );
          gl.compileShader(vertex);
          const vertexCompile = gl.getShaderParameter(
            vertex,
            gl.COMPILE_STATUS,
          ) as boolean;
          const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(fragment, artifact.glsl);
          gl.compileShader(fragment);
          const program = gl.createProgram()!;
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
          const module = device.createShaderModule({ code: artifact.wgsl });
          const info = await module.getCompilationInfo();
          return {
            available: true as const,
            vertexCompile,
            glCompile: gl.getShaderParameter(
              fragment,
              gl.COMPILE_STATUS,
            ) as boolean,
            glLink: gl.getProgramParameter(program, gl.LINK_STATUS) as boolean,
            glLog: gl.getShaderInfoLog(fragment),
            linkLog: gl.getProgramInfoLog(program),
            wgslErrors: info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          };
        } finally {
          device.destroy();
        }
      }, result.artifact);
      expect(
        compiled.available,
        compiled.available ? "" : compiled.reason,
      ).toBe(true);
      if (!compiled.available) return;
      expect(compiled.vertexCompile).toBe(true);
      expect(compiled.glCompile, compiled.glLog ?? "").toBe(true);
      expect(compiled.glLink, compiled.linkLog ?? "").toBe(true);
      expect(compiled.wgslErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("reports helper recursion and unsupported shader imports at authored ranges", () => {
    const loopSource = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const loop = defineShaderFunction((x: Expr<F32>) => loop(x));`;
    const recursive = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": entry
            .replace(
              'import { grain } from "./shared.shdr.ts";',
              'import { loop } from "./loop.shdr.ts";',
            )
            .replace("grain(coord.xy, uniforms.time)", "loop(coord.x)"),
          "/work/loop.shdr.ts": loopSource,
        },
      }),
    );
    expect(recursive.ok).toBe(false);
    if (!recursive.ok) {
      expect(recursive.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.RecursiveShaderFunction,
        fileName: "/work/loop.shdr.ts",
      });
      expect(
        loopSource.slice(
          recursive.diagnostics[0]!.range.start,
          recursive.diagnostics[0]!.range.start +
            recursive.diagnostics[0]!.range.length,
        ),
      ).toBe("loop(x)");
    }

    const unsupported = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": entry.replace(
            'import { grain } from "./shared.shdr.ts";',
            'import { grain } from "./shared.ts";',
          ),
          "/work/shared.ts": shared,
        },
      }),
    );
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok)
      expect(unsupported.diagnostics[0]?.code).toBe(
        ShaderDiagnosticCode.UnsupportedShaderModuleImport,
      );
  });

  it("rejects module cycles before producing an artifact", () => {
    const cycle = compileFragmentArtifact(
      graph({
        files: {
          "/work/scene.shdr.ts": entry,
          "/work/shared.shdr.ts": shared
            .replace(
              'import { ramp as base } from "./math.shdr.ts";',
              'import { grain } from "./shared.shdr.ts";',
            )
            .replace("base(p, seed)", "grain(p, seed)"),
          "/work/math.shdr.ts": math,
        },
      }),
    );
    expect(cycle.ok).toBe(false);
    if (cycle.ok) return;
    expect(cycle.diagnostics[0]?.code).toBe(
      ShaderDiagnosticCode.ShaderModuleCycle,
    );
    expect(cycle.artifact).toBeUndefined();
  });
});

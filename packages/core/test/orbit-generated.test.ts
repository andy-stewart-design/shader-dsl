import { chromium } from "playwright";
import { expect, it } from "vitest";
import { compileFragment } from "../src/index.js";

type Shape = "s" | "v2" | "v3" | "v4";
const shapes: readonly Shape[] = ["s", "v2", "v3", "v4"];
const names = ["asin", "acos", "atan", "radians", "degrees"] as const;
const imports = [
  ...names,
  "sin",
  "cos",
  "mod",
  "createFragmentShader",
  "vec2",
  "vec3",
  "vec4",
].join(", ");

function source(call: string, shape: Shape): string {
  const result =
    shape === "s" ? `vec4(result, 0, 0, 1)` : `vec4(result.x, 0, 0, 1)`;
  return `import { ${imports} } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return ${result};
});`;
}

it("compiles all orbit unary and mod shapes in real GLSL and WGSL compilers", async () => {
  const examples = [
    ...names.flatMap((name) =>
      shapes.map((shape) => ({
        name: `${name}(${shape})`,
        call: `${name}(${shape})`,
        shape,
      })),
    ),
    {
      name: "asin(cos(1) + 1)",
      call: "asin(cos(1) + 1)",
      shape: "s" as const,
    },
    {
      name: "acos(sin(1) + 1)",
      call: "acos(sin(1) + 1)",
      shape: "s" as const,
    },
    {
      name: "degrees(dynamic + 3e38)",
      call: "degrees(s + 3e38)",
      shape: "s" as const,
    },
    { name: "atan(S,S)", call: "atan(s, s)", shape: "s" as const },
    { name: "atan(V2,V2)", call: "atan(v2, v2)", shape: "v2" as const },
    { name: "atan(V3,V3)", call: "atan(v3, v3)", shape: "v3" as const },
    { name: "atan(V4,V4)", call: "atan(v4, v4)", shape: "v4" as const },
    { name: "mod(S,S)", call: "mod(s, s)", shape: "s" as const },
    { name: "mod(V2,V2)", call: "mod(v2, v2)", shape: "v2" as const },
    { name: "mod(V2,S)", call: "mod(v2, s)", shape: "v2" as const },
    { name: "mod(V3,V3)", call: "mod(v3, v3)", shape: "v3" as const },
    { name: "mod(V3,S)", call: "mod(v3, s)", shape: "v3" as const },
    { name: "mod(V4,V4)", call: "mod(v4, v4)", shape: "v4" as const },
    { name: "mod(V4,S)", call: "mod(v4, s)", shape: "v4" as const },
  ];
  const shaders = examples.map(({ name, call, shape }) => {
    const input = source(call, shape);
    const glsl = compileFragment(input, { target: "glsl-es-300" });
    const wgsl = compileFragment(input, { target: "wgsl" });
    expect(glsl.ok, `${name} GLSL`).toBe(true);
    expect(wgsl.ok, `${name} WGSL`).toBe(true);
    if (!glsl.ok || !wgsl.ok) throw new Error(name);
    expect(glsl.ir).toEqual(wgsl.ir);
    expect(glsl.code).not.toContain("__shdr_internal_");
    expect(wgsl.code).not.toContain("__shdr_internal_");
    if (name.startsWith("atan(") && name.includes(","))
      expect(wgsl.code).toContain("atan2(");
    if (name.startsWith("mod"))
      expect(wgsl.code).toContain("fn shdr_internal_mod_");
    if (
      name.startsWith("asin(") ||
      name.startsWith("acos(") ||
      name.startsWith("degrees(")
    )
      expect(wgsl.code).toContain("fn shdr_internal_safe_");
    return { glsl: glsl.code, wgsl: wgsl.code };
  });

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
    const result = await page.evaluate(async (codes) => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const glslErrors = codes.map(({ glsl }) => {
        const shader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!shader) throw new Error("Could not create GLSL shader");
        gl.shaderSource(shader, glsl);
        gl.compileShader(shader);
        const errors = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? []
          : [gl.getShaderInfoLog(shader) ?? "GLSL compilation failed"];
        gl.deleteShader(shader);
        return errors;
      });
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const wgslErrors = [] as string[][];
        for (const { wgsl } of codes) {
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          wgslErrors.push(
            info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          );
        }
        return { glslErrors, wgslErrors };
      } finally {
        device.destroy();
      }
    }, shaders);
    expect(result.glslErrors).toEqual(shaders.map(() => []));
    expect(result.wgslErrors).toEqual(shaders.map(() => []));
  } finally {
    await browser.close();
  }
}, 60_000);

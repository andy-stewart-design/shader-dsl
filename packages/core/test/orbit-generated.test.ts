import { chromium } from "playwright";
import { expect, it } from "vitest";
import { compileFragment } from "../src/index.js";

type Shape = "s" | "v2" | "v3" | "v4";
const shapes: readonly Shape[] = ["s", "v2", "v3", "v4"];
const names = ["asin", "acos", "atan", "radians", "degrees"] as const;
const imports = [...names, "createFragmentShader", "vec2", "vec3", "vec4"].join(
  ", ",
);

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

it("compiles all twenty orbit unary shapes in real GLSL and WGSL compilers", async () => {
  const shaders = names.flatMap((name) =>
    shapes.map((shape) => {
      const input = source(`${name}(${shape})`, shape);
      const glsl = compileFragment(input, { target: "glsl-es-300" });
      const wgsl = compileFragment(input, { target: "wgsl" });
      expect(glsl.ok, `${name}(${shape}) GLSL`).toBe(true);
      expect(wgsl.ok, `${name}(${shape}) WGSL`).toBe(true);
      if (!glsl.ok || !wgsl.ok) throw new Error(`${name}(${shape})`);
      expect(glsl.ir).toEqual(wgsl.ir);
      expect(glsl.code).not.toContain("__shdr_internal_");
      expect(wgsl.code).not.toContain("__shdr_internal_");
      return { glsl: glsl.code, wgsl: wgsl.code };
    }),
  );

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

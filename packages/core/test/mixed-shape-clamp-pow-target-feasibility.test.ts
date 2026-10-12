import { chromium } from "playwright";
import { expect, it } from "vitest";

type Family =
  | "clamp(V,S,S)"
  | "clamp(V,S,V)"
  | "clamp(V,V,S)"
  | "clamp(V,V,V)"
  | "pow(V,S)"
  | "pow(V,V)";

const families: readonly Family[] = [
  "clamp(V,S,S)",
  "clamp(V,S,V)",
  "clamp(V,V,S)",
  "clamp(V,V,V)",
  "pow(V,S)",
  "pow(V,V)",
];

function expression(
  family: Family,
  size: 2 | 3 | 4,
  expanded: boolean,
): string {
  const vector = `vec${size}`;
  const scalar = (value: string): string =>
    expanded ? `${vector}(${value})` : value;
  switch (family) {
    case "clamp(V,S,S)":
      return `clamp(v${size}, ${scalar("s")}, ${scalar("t")})`;
    case "clamp(V,S,V)":
      return `clamp(v${size}, ${scalar("s")}, w${size})`;
    case "clamp(V,V,S)":
      return `clamp(v${size}, low${size}, ${scalar("t")})`;
    case "clamp(V,V,V)":
      return `clamp(v${size}, low${size}, high${size})`;
    case "pow(V,S)":
      return `pow(v${size}, ${scalar("s")})`;
    case "pow(V,V)":
      return `pow(v${size}, w${size})`;
  }
}

function wgslExpression(
  family: Family,
  size: 2 | 3 | 4,
  expanded: boolean,
): string {
  const vector = `vec${size}<f32>`;
  const scalar = (value: string): string =>
    expanded ? `${vector}(${value})` : value;
  switch (family) {
    case "clamp(V,S,S)":
      return `clamp(v${size}, ${scalar("s")}, ${scalar("t")})`;
    case "clamp(V,S,V)":
      return `clamp(v${size}, ${scalar("s")}, w${size})`;
    case "clamp(V,V,S)":
      return `clamp(v${size}, low${size}, ${scalar("t")})`;
    case "clamp(V,V,V)":
      return `clamp(v${size}, low${size}, high${size})`;
    case "pow(V,S)":
      return `pow(v${size}, ${scalar("s")})`;
    case "pow(V,V)":
      return `pow(v${size}, w${size})`;
  }
}

function glslSource(
  family: Family,
  size: 2 | 3 | 4,
  expanded: boolean,
): string {
  const vector = `vec${size}`;
  return `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = 1.25;
  float t = 2.5;
  ${vector} v${size} = ${vector}(${Array.from({ length: size }, (_, index) => `${1.1 + index / 10}`).join(", ")});
  ${vector} low${size} = ${vector}(0.1);
  ${vector} high${size} = ${vector}(2.0);
  ${vector} w${size} = ${vector}(${Array.from({ length: size }, (_, index) => `${1.1 + index / 10}`).join(", ")});
  ${vector} result = ${expression(family, size, expanded)};
  color = vec4(result.x);
}`;
}

function wgslSource(
  family: Family,
  size: 2 | 3 | 4,
  expanded: boolean,
): string {
  const vector = `vec${size}<f32>`;
  return `@fragment fn main() -> @location(0) vec4<f32> {
  let s: f32 = 1.25;
  let t: f32 = 2.5;
  let v${size}: ${vector} = ${vector}(${Array.from({ length: size }, (_, index) => `${1.1 + index / 10}`).join(", ")});
  let low${size}: ${vector} = ${vector}(0.1);
  let high${size}: ${vector} = ${vector}(2.0);
  let w${size}: ${vector} = ${vector}(${Array.from({ length: size }, (_, index) => `${1.1 + index / 10}`).join(", ")});
  let result: ${vector} = ${wgslExpression(family, size, expanded)};
  return vec4<f32>(result.x);
}`;
}

it("maps mixed clamp/pow signatures to real GLSL and WGSL target acceptance", async () => {
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
    const samples = families.flatMap((family) =>
      ([2, 3, 4] as const).flatMap((size) =>
        ([false, true] as const).map((expanded) => ({
          family,
          size,
          expanded,
          glslSource: glslSource(family, size, expanded),
          wgslSource: wgslSource(family, size, expanded),
        })),
      ),
    );
    const result = await page.evaluate(
      async ({ samples }) => {
        const canvas = document.querySelector("canvas")!;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const output = [];
          for (const sample of samples) {
            const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(shader, sample.glslSource);
            gl.compileShader(shader);
            const glsl = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
              ? null
              : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
            gl.deleteShader(shader);
            const info = await device
              .createShaderModule({ code: sample.wgslSource })
              .getCompilationInfo();
            output.push({
              family: sample.family,
              size: sample.size,
              expanded: sample.expanded,
              glsl,
              wgsl: info.messages
                .filter((message) => message.type === "error")
                .map((message) => message.message),
            });
          }
          return output;
        } finally {
          device.destroy();
        }
      },
      { samples },
    );

    for (const row of result) {
      const sameShape =
        row.family === "clamp(V,V,V)" || row.family === "pow(V,V)";
      if (row.expanded || sameShape) {
        expect(row.glsl, `${row.family} V${row.size}`).toBeNull();
        expect(row.wgsl, `${row.family} V${row.size}`).toEqual([]);
      } else if (row.family === "clamp(V,S,S)") {
        // GLSL ES has this legacy overload; WGSL requires explicit splats.
        expect(row.glsl, `${row.family} V${row.size}`).toBeNull();
        expect(row.wgsl, `${row.family} V${row.size}`).not.toEqual([]);
      } else {
        expect(row.glsl, `${row.family} V${row.size}`).not.toBeNull();
        expect(row.wgsl, `${row.family} V${row.size}`).not.toEqual([]);
      }
    }
  } finally {
    await browser.close();
  }
}, 60_000);

it("confirms vector guarded helpers defer WGSL constant domain checks", async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--enable-unsafe-webgpu"],
  });
  try {
    const page = await browser.newPage();
    await page.route("http://localhost/", (route) =>
      route.fulfill({ body: "<!doctype html>" }),
    );
    await page.goto("http://localhost/");
    const result = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const output: Record<string, string[]> = {};
        for (const size of [2, 3, 4]) {
          const type = `vec${size}<f32>`;
          const values = (value: string) =>
            `${type}(${Array(size).fill(value).join(", ")})`;
          for (const [label, builtin, args, declaration] of [
            [
              "clamp",
              `clamp(${values("0.5f")}, ${values("1.0f")}, ${values("0.0f")})`,
              `shdr_internal_safe_clamp_vec${size}(${values("0.5f")}, ${values("1.0f")}, ${values("0.0f")})`,
              `fn shdr_internal_safe_clamp_vec${size}(a: ${type}, b: ${type}, c: ${type}) -> ${type} { return clamp(a, b, c); }`,
            ],
            [
              "pow",
              `pow(${values("1e30f")}, ${values("4.0f")})`,
              `shdr_internal_safe_pow_vec${size}(${values("1e30f")}, ${values("4.0f")})`,
              `fn shdr_internal_safe_pow_vec${size}(a: ${type}, b: ${type}) -> ${type} { return pow(a, b); }`,
            ],
          ] as const) {
            for (const [variant, call, prefix] of [
              ["direct", builtin, ""],
              ["helper", args, declaration],
            ] as const) {
              const info = await device
                .createShaderModule({
                  code: `${prefix}\n@fragment fn main() -> @location(0) vec4<f32> { let result: ${type} = ${call}; return vec4<f32>(result.x); }`,
                })
                .getCompilationInfo();
              output[`${label}-V${size}-${variant}`] = info.messages
                .filter((message) => message.type === "error")
                .map((message) => message.message);
            }
          }
        }
        return output;
      } finally {
        device.destroy();
      }
    });

    for (const size of [2, 3, 4]) {
      expect(result[`clamp-V${size}-direct`]).not.toEqual([]);
      expect(result[`clamp-V${size}-helper`]).toEqual([]);
      expect(result[`pow-V${size}-direct`]).not.toEqual([]);
      expect(result[`pow-V${size}-helper`]).toEqual([]);
    }
  } finally {
    await browser.close();
  }
}, 60_000);

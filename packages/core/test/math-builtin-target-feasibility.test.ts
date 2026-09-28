import { chromium } from "playwright";
import { expect, it } from "vitest";

// Raw target syntax only: no shdr import, virtual checker, IR, or generator.
// Explicit result declarations force both target compilers to type-check every
// proposed signature, while the accumulation keeps every call reachable.
type Shape = "s" | "v2" | "v3" | "v4";
interface RawCase {
  readonly label: string;
  readonly expression: string;
  readonly result: Shape;
}

const cases: RawCase[] = [];
for (const name of ["sin", "cos"] as const) {
  cases.push({ label: `${name}(S)`, expression: `${name}(s)`, result: "s" });
  for (const size of [2, 3, 4] as const) {
    const shape = `v${size}` as const;
    cases.push({
      label: `${name}(V${size})`,
      expression: `${name}(${shape})`,
      result: shape,
    });
  }
}
cases.push({
  label: "smoothstep(S,S,S)",
  expression: "smoothstep(0.0, 1.0, t)",
  result: "s",
});
for (const size of [2, 3, 4] as const) {
  const shape = `v${size}` as const;
  cases.push({
    label: `smoothstep(V${size},V${size},V${size})`,
    expression: `smoothstep(${shape} * 0.0, w${size}, ${shape})`,
    result: shape,
  });
}

for (const name of ["abs", "floor", "fract"] as const) {
  cases.push({ label: `${name}(S)`, expression: `${name}(s)`, result: "s" });
  for (const size of [2, 3, 4] as const) {
    const shape = `v${size}` as const;
    cases.push({
      label: `${name}(V${size})`,
      expression: `${name}(${shape})`,
      result: shape,
    });
  }
}
for (const name of ["min", "max"] as const) {
  cases.push({
    label: `${name}(S,S)`,
    expression: `${name}(s, t)`,
    result: "s",
  });
  for (const size of [2, 3, 4] as const) {
    const shape = `v${size}` as const;
    cases.push({
      label: `${name}(V${size},V${size})`,
      expression: `${name}(${shape}, w${size})`,
      result: shape,
    });
  }
}
cases.push({ label: "length(S)", expression: "length(s)", result: "s" });
for (const size of [2, 3, 4] as const) {
  const shape = `v${size}` as const;
  cases.push(
    {
      label: `dot(V${size},V${size})`,
      expression: `dot(${shape}, w${size})`,
      result: "s",
    },
    {
      label: `length(V${size})`,
      expression: `length(${shape})`,
      result: "s",
    },
    {
      label: `normalize(V${size})`,
      expression: `normalize(${shape})`,
      result: shape,
    },
  );
}

const glslTypes: Record<Shape, string> = {
  s: "float",
  v2: "vec2",
  v3: "vec3",
  v4: "vec4",
};
const wgslTypes: Record<Shape, string> = {
  s: "f32",
  v2: "vec2<f32>",
  v3: "vec3<f32>",
  v4: "vec4<f32>",
};

const GLSL = `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = -0.375;
  float t = 0.625;
  vec2 v2 = vec2(s, t);
  vec3 v3 = vec3(s, t, 1.25);
  vec4 v4 = vec4(s, t, 1.25, -0.75);
  vec2 w2 = vec2(t, 0.25);
  vec3 w3 = vec3(t, 0.25, 0.75);
  vec4 w4 = vec4(t, 0.25, 0.75, 1.0);
  vec4 accumulated = vec4(0.0);
${cases
  .map((entry, index) => {
    const name = `result${index}`;
    const scalar = entry.result === "s" ? name : `${name}.x`;
    return `  // ${entry.label}\n  ${glslTypes[entry.result]} ${name} = ${entry.expression};\n  accumulated += vec4(${scalar});`;
  })
  .join("\n")}
  color = accumulated;
}
`;

const WGSL = `@fragment fn main() -> @location(0) vec4<f32> {
  let s: f32 = -0.375;
  let t: f32 = 0.625;
  let v2: vec2<f32> = vec2<f32>(s, t);
  let v3: vec3<f32> = vec3<f32>(s, t, 1.25);
  let v4: vec4<f32> = vec4<f32>(s, t, 1.25, -0.75);
  let w2: vec2<f32> = vec2<f32>(t, 0.25);
  let w3: vec3<f32> = vec3<f32>(t, 0.25, 0.75);
  let w4: vec4<f32> = vec4<f32>(t, 0.25, 0.75, 1.0);
  var accumulated: vec4<f32> = vec4<f32>(0.0);
${cases
  .map((entry, index) => {
    const name = `result${index}`;
    const scalar = entry.result === "s" ? name : `${name}.x`;
    return `  // ${entry.label}\n  let ${name}: ${wgslTypes[entry.result]} = ${entry.expression};\n  accumulated += vec4<f32>(${scalar});`;
  })
  .join("\n")}
  return accumulated;
}
`;

it("compiles all 42 proposed scalar/vector builtin signatures in raw GLSL ES 3.00 and WGSL", async () => {
  expect(cases).toHaveLength(42);
  expect(new Set(cases.map((entry) => entry.label)).size).toBe(cases.length);

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
    const result = await page.evaluate(
      async ({ glsl, wgsl }) => {
        const gl = document.querySelector("canvas")?.getContext("webgl2");
        if (!gl) return { glsl: "WebGL 2 unavailable", wgsl: "not checked" };
        const shader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!shader)
          return { glsl: "Could not create shader", wgsl: "not checked" };
        gl.shaderSource(shader, glsl);
        gl.compileShader(shader);
        const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? null
          : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
        gl.deleteShader(shader);

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter)
          return { glsl: glslError, wgsl: "WebGPU adapter unavailable" };
        const device = await adapter.requestDevice();
        try {
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          return {
            glsl: glslError,
            wgsl:
              info.messages
                .filter((message) => message.type === "error")
                .map((message) => message.message)
                .join("\n") || null,
          };
        } finally {
          device.destroy();
        }
      },
      { glsl: GLSL, wgsl: WGSL },
    );
    expect(result).toEqual({ glsl: null, wgsl: null });
  } finally {
    await browser.close();
  }
}, 60_000);

it("reports const-equal smoothstep edges as a WGSL shader-creation error", async () => {
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
    const errors = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const bodies = {
          scalar:
            "let r: f32 = smoothstep(0.0, 0.0, 0.5); return vec4<f32>(r);",
          vector:
            "let r: vec2<f32> = smoothstep(vec2<f32>(0.0, 0.2), vec2<f32>(0.0, 0.8), vec2<f32>(0.5)); return vec4<f32>(r.x);",
          dynamic:
            "let edge: f32 = position.x; let r: f32 = smoothstep(edge, edge, 0.5); return vec4<f32>(r);",
        };
        const result: Record<string, string[]> = {};
        for (const [name, body] of Object.entries(bodies)) {
          const module = device.createShaderModule({
            code: `@fragment fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> { ${body} }`,
          });
          const info = await module.getCompilationInfo();
          result[name] = info.messages
            .filter((message) => message.type === "error")
            .map((message) => message.message);
        }
        return result;
      } finally {
        device.destroy();
      }
    });
    expect(errors.scalar).toEqual([expect.stringMatching(/smoothstep.*equal/)]);
    expect(errors.vector).toEqual([expect.stringMatching(/smoothstep.*equal/)]);
    // This is only a compile check: the runtime value for equal edges is indeterminate.
    expect(errors.dynamic).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

// Shader compilation alone does not establish a useful numeric contract.
// These finite, non-degenerate raw target results cover negative fract/floor
// and a nonzero normalized vector without claiming bit-exact target parity.
it("checks finite edge examples in raw WebGL and WebGPU", async () => {
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
      route.fulfill({
        body: "<!doctype html><canvas width=1 height=1></canvas>",
      }),
    );
    await page.goto("http://localhost/");
    const result = await page.evaluate(async () => {
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Could not create WebGL shader");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? "GLSL compile failed");
        }
        return shader;
      };
      const vertex = compile(
        gl.VERTEX_SHADER,
        `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,
      );
      const fragment = compile(
        gl.FRAGMENT_SHADER,
        `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = -1.25;
  vec2 unit = normalize(vec2(3.0, 4.0));
  color = vec4(fract(s), floor(s) + 2.0, dot(unit, unit), smoothstep(0.0, 1.0, 0.5));
}`,
      );
      const program = gl.createProgram();
      if (!program) throw new Error("Could not create WebGL program");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "WebGL link failed");
      }
      gl.useProgram(program);
      gl.viewport(0, 0, 1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (gl.getError() !== gl.NO_ERROR)
        throw new Error("WebGL readback failed");
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);

      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      // WebGPU globals exist in Chromium, but this workspace's TS DOM lib
      // does not declare the GPUBufferUsage/GPUMapMode flag objects.
      const gpuFlags = globalThis as typeof globalThis & {
        GPUBufferUsage: {
          STORAGE: number;
          COPY_SRC: number;
          COPY_DST: number;
          MAP_READ: number;
        };
        GPUMapMode: { READ: number };
      };
      try {
        const module = device.createShaderModule({
          code: `@group(0) @binding(0) var<storage, read_write> output: array<f32, 5>;
@compute @workgroup_size(1) fn main() {
  let s: f32 = -1.25;
  let unit: vec2<f32> = normalize(vec2<f32>(3.0, 4.0));
  output[0] = fract(s);
  output[1] = floor(s);
  output[2] = abs(s);
  output[3] = dot(unit, unit);
  output[4] = smoothstep(0.0, 1.0, 0.5);
}`,
        });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(
          (message) => message.type === "error",
        );
        if (errors.length > 0) {
          throw new Error(errors.map((message) => message.message).join("\n"));
        }
        const pipeline = device.createComputePipeline({
          layout: "auto",
          compute: { module, entryPoint: "main" },
        });
        const output = device.createBuffer({
          size: 20,
          usage:
            gpuFlags.GPUBufferUsage.STORAGE | gpuFlags.GPUBufferUsage.COPY_SRC,
        });
        const readback = device.createBuffer({
          size: 20,
          usage:
            gpuFlags.GPUBufferUsage.COPY_DST | gpuFlags.GPUBufferUsage.MAP_READ,
        });
        try {
          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: output } }],
          });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.dispatchWorkgroups(1);
          pass.end();
          encoder.copyBufferToBuffer(output, 0, readback, 0, 20);
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync(gpuFlags.GPUMapMode.READ);
          const values = [...new Float32Array(readback.getMappedRange())];
          readback.unmap();
          return { pixel: [...pixel], values };
        } finally {
          output.destroy();
          readback.destroy();
        }
      } finally {
        device.destroy();
      }
    });
    expect(result.pixel[0]).toBeGreaterThanOrEqual(189);
    expect(result.pixel[0]).toBeLessThanOrEqual(193);
    expect(result.pixel[1]).toBe(0);
    expect(result.pixel[2]).toBeGreaterThanOrEqual(253);
    expect(result.pixel[3]).toBeGreaterThanOrEqual(126);
    expect(result.pixel[3]).toBeLessThanOrEqual(130);
    const expected = [0.75, -2, 1.25, 1, 0.5];
    for (const [index, value] of expected.entries()) {
      expect(result.values[index]).toBeCloseTo(value, 4);
    }
  } finally {
    await browser.close();
  }
}, 60_000);

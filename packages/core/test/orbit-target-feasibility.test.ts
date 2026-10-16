import { chromium } from "playwright";
import { expect, it } from "vitest";

type Shape = "s" | "v2" | "v3" | "v4";

const shapes: readonly Shape[] = ["s", "v2", "v3", "v4"];
const glslType: Record<Shape, string> = {
  s: "float",
  v2: "vec2",
  v3: "vec3",
  v4: "vec4",
};
const wgslType: Record<Shape, string> = {
  s: "f32",
  v2: "vec2<f32>",
  v3: "vec3<f32>",
  v4: "vec4<f32>",
};
const component = (shape: Shape, name: string) =>
  shape === "s" ? name : `${name}.x`;

interface SignatureCase {
  readonly label: string;
  readonly shape: Shape;
  readonly glsl: string;
  readonly wgsl: string;
}

const signatureCases: SignatureCase[] = [];
for (const name of ["asin", "acos", "radians", "degrees"] as const) {
  for (const shape of shapes) {
    signatureCases.push({
      label: `${name}(${shape.toUpperCase()})`,
      shape,
      glsl: `${name}(${shape === "s" ? "s" : shape})`,
      wgsl: `${name}(${shape === "s" ? "s" : shape})`,
    });
  }
}
for (const shape of shapes) {
  signatureCases.push(
    {
      label: `atan(${shape.toUpperCase()})`,
      shape,
      glsl: `atan(${shape === "s" ? "s" : shape})`,
      wgsl: `atan(${shape === "s" ? "s" : shape})`,
    },
    {
      label: `atan(${shape.toUpperCase()},${shape.toUpperCase()})`,
      shape,
      glsl: `atan(${shape === "s" ? "s, t" : `${shape}, w${shape}`})`,
      wgsl: `atan2(${shape === "s" ? "s, t" : `${shape}, w${shape}`})`,
    },
  );
}

const modCases: SignatureCase[] = [
  {
    label: "mod(S,S)",
    shape: "s",
    glsl: "s - t * floor(s / t)",
    wgsl: "s - t * floor(s / t)",
  },
];
for (const shape of ["v2", "v3", "v4"] as const) {
  modCases.push(
    {
      label: `mod(${shape.toUpperCase()},${shape.toUpperCase()})`,
      shape,
      glsl: `${shape} - w${shape} * floor(${shape} / w${shape})`,
      wgsl: `${shape} - w${shape} * floor(${shape} / w${shape})`,
    },
    {
      label: `mod(${shape.toUpperCase()},S)`,
      shape,
      glsl: `${shape} - ${glslType[shape]}(t) * floor(${shape} / ${glslType[shape]}(t))`,
      wgsl: `${shape} - ${wgslType[shape]}(t) * floor(${shape} / ${wgslType[shape]}(t))`,
    },
  );
}

const allCases = [...signatureCases, ...modCases];

function glslSource(cases: readonly SignatureCase[]): string {
  return `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = -0.375;
  float t = 0.625;
  vec2 v2 = vec2(s, t);
  vec3 v3 = vec3(s, t, 1.25);
  vec4 v4 = vec4(s, t, 1.25, -0.75);
  vec2 wv2 = vec2(t, 0.25);
  vec3 wv3 = vec3(t, 0.25, 0.75);
  vec4 wv4 = vec4(t, 0.25, 0.75, 1.0);
  vec4 accumulated = vec4(0.0);
${cases
  .map((entry, index) => {
    const name = `result${index}`;
    const expression = entry.glsl
      .replaceAll("wv2", "wv2")
      .replaceAll("wv3", "wv3")
      .replaceAll("wv4", "wv4");
    return `  ${glslType[entry.shape]} ${name} = ${expression};\n  accumulated += vec4(${component(entry.shape, name)});`;
  })
  .join("\n")}
  color = accumulated;
}`;
}

function wgslSource(cases: readonly SignatureCase[]): string {
  return `@fragment fn main() -> @location(0) vec4<f32> {
  let s: f32 = -0.375;
  let t: f32 = 0.625;
  let v2: vec2<f32> = vec2<f32>(s, t);
  let v3: vec3<f32> = vec3<f32>(s, t, 1.25);
  let v4: vec4<f32> = vec4<f32>(s, t, 1.25, -0.75);
  let wv2: vec2<f32> = vec2<f32>(t, 0.25);
  let wv3: vec3<f32> = vec3<f32>(t, 0.25, 0.75);
  let wv4: vec4<f32> = vec4<f32>(t, 0.25, 0.75, 1.0);
  var accumulated: vec4<f32> = vec4<f32>(0.0);
${cases
  .map((entry, index) => {
    const name = `result${index}`;
    return `  let ${name}: ${wgslType[entry.shape]} = ${entry.wgsl};\n  accumulated += vec4<f32>(${component(entry.shape, name)});`;
  })
  .join("\n")}
  return accumulated;
}`;
}

async function withBrowser<T>(
  callback: (page: import("playwright").Page) => Promise<T>,
): Promise<T> {
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
    return await callback(page);
  } finally {
    await browser.close();
  }
}

it("compiles all 31 agreed raw target shapes with native angle spellings and explicit mod lowering", async () => {
  expect(signatureCases).toHaveLength(24);
  expect(modCases).toHaveLength(7);
  expect(allCases).toHaveLength(31);
  expect(new Set(allCases.map(({ label }) => label)).size).toBe(31);

  const result = await withBrowser(async (page) =>
    page.evaluate(
      async ({ glsl, wgsl }) => {
        const canvas = document.querySelector("canvas");
        const gl = canvas?.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const shader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!shader) throw new Error("Could not create WebGL shader");
        gl.shaderSource(shader, glsl);
        gl.compileShader(shader);
        const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? null
          : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
        gl.deleteShader(shader);

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          return {
            glslError,
            wgslErrors: info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          };
        } finally {
          device.destroy();
        }
      },
      { glsl: glslSource(allCases), wgsl: wgslSource(allCases) },
    ),
  );

  expect(result).toEqual({ glslError: null, wgslErrors: [] });
});

it("records native GLSL mod broadcasting separately from the explicit formula strategy", async () => {
  const expressions = [
    ["mod(S,S)", "float", "mod(s, t)"],
    ["mod(V2,V2)", "vec2", "mod(v2, wv2)"],
    ["mod(V3,V3)", "vec3", "mod(v3, wv3)"],
    ["mod(V4,V4)", "vec4", "mod(v4, wv4)"],
    ["mod(V2,S)", "vec2", "mod(v2, t)"],
    ["mod(V3,S)", "vec3", "mod(v3, t)"],
    ["mod(V4,S)", "vec4", "mod(v4, t)"],
    ["mod(S,V2)", "float", "mod(s, v2)"],
  ] as const;
  const results = await withBrowser((page) =>
    page.evaluate((entries) => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      return entries.map(([label, type, expression]) => {
        const shader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!shader) throw new Error("Could not create WebGL shader");
        gl.shaderSource(
          shader,
          `#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { float s = -0.375; float t = 0.625; vec2 v2 = vec2(s,t); vec3 v3 = vec3(s,t,1.25); vec4 v4 = vec4(s,t,1.25,-0.75); vec2 wv2 = vec2(t,0.25); vec3 wv3 = vec3(t,0.25,0.75); vec4 wv4 = vec4(t,0.25,0.75,1.0); ${type} value = ${expression}; color = vec4(${type === "float" ? "value" : "value.x"}); }`,
        );
        gl.compileShader(shader);
        const result = {
          label,
          accepted: Boolean(gl.getShaderParameter(shader, gl.COMPILE_STATUS)),
          error: gl.getShaderInfoLog(shader),
        };
        gl.deleteShader(shader);
        return result;
      });
    }, expressions),
  );

  // Same-shape native overloads are accepted; mixed vector/scalar forms are
  // observations only and must not be confused with Shdr's explicit splat.
  expect(results.slice(0, 4).every(({ accepted }) => accepted)).toBe(true);
  console.info("orbit native GLSL mod observations", JSON.stringify(results));
});

it("compares signed floor-based mod results on both raw targets", async () => {
  const result = await withBrowser((page) =>
    page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const vertexSource = `#version 300 es\nvoid main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
      const render = (values: string) => {
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Could not create WebGL shader");
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(shader) ?? "GLSL compile failed",
            );
          return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, vertexSource);
        const fragment = compile(
          gl.FRAGMENT_SHADER,
          `#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { color = vec4(0.5) + 0.1 * (${values}); }`,
        );
        const program = gl.createProgram();
        if (!program) throw new Error("Could not create WebGL program");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) ?? "GLSL link failed");
        const framebuffer = gl.createFramebuffer();
        const texture = gl.createTexture();
        if (!framebuffer || !texture)
          throw new Error("Could not create framebuffer");
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          1,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw new Error("Incomplete WebGL framebuffer");
        gl.useProgram(program);
        gl.viewport(0, 0, 1, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (gl.getError() !== gl.NO_ERROR)
          throw new Error("WebGL readback failed");
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        return [...pixel].map((value) => (value / 255 - 0.5) / 0.1);
      };

      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      const gpuFlags = globalThis as typeof globalThis & {
        GPUBufferUsage: {
          STORAGE: number;
          COPY_SRC: number;
          COPY_DST: number;
          MAP_READ: number;
        };
        GPUMapMode: { READ: number };
      };
      const module = device.createShaderModule({
        code: `@group(0) @binding(0) var<storage, read_write> output: array<f32, 16>;
fn floor_mod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
@compute @workgroup_size(1) fn main() {
  let scalar = array<f32, 4>(floor_mod(-1.5, 1.0), floor_mod(1.5, -1.0), floor_mod(-1.5, -1.0), floor_mod(4.0, 2.0));
  let x = vec4<f32>(-1.5, 1.5, -4.5, 4.5);
  let y = vec4<f32>(1.0, -1.0, 2.0, -2.0);
  let vector = x - y * floor(x / y);
  let broadcast = x - vec4<f32>(-2.0) * floor(x / vec4<f32>(-2.0));
  let limits = array<f32, 4>(floor_mod(1.234567, 1e-6), floor_mod(1.234567, 1e-20), floor_mod(3.1415927, 1e-3), floor_mod(3e38, 7.0));
  for (var i: u32 = 0u; i < 4u; i++) { output[i] = scalar[i]; output[4u + i] = vector[i]; output[8u + i] = broadcast[i]; output[12u + i] = limits[i]; }
}`,
      });
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter(
        (message) => message.type === "error",
      );
      if (errors.length)
        throw new Error(errors.map((message) => message.message).join("\n"));
      const pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "main" },
      });
      const storage = device.createBuffer({
        size: 64,
        usage:
          gpuFlags.GPUBufferUsage.STORAGE | gpuFlags.GPUBufferUsage.COPY_SRC,
      });
      const readback = device.createBuffer({
        size: 64,
        usage:
          gpuFlags.GPUBufferUsage.COPY_DST | gpuFlags.GPUBufferUsage.MAP_READ,
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: storage } }],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
      encoder.copyBufferToBuffer(storage, 0, readback, 0, 64);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(gpuFlags.GPUMapMode.READ);
      const wgsl = [...new Float32Array(readback.getMappedRange())];
      readback.unmap();
      storage.destroy();
      readback.destroy();
      device.destroy();
      return {
        glslNativeScalar: render(
          "vec4(mod(-1.5, 1.0), mod(1.5, -1.0), mod(-1.5, -1.0), mod(4.0, 2.0))",
        ),
        glslNativeVector: render(
          "mod(vec4(-1.5, 1.5, -4.5, 4.5), vec4(1.0, -1.0, 2.0, -2.0))",
        ),
        glslFormulaScalar: render(
          "vec4(-1.5 - 1.0 * floor(-1.5 / 1.0), 1.5 - -1.0 * floor(1.5 / -1.0), -1.5 - -1.0 * floor(-1.5 / -1.0), 4.0 - 2.0 * floor(4.0 / 2.0))",
        ),
        glslFormulaVector: render(
          "vec4(-1.5, 1.5, -4.5, 4.5) - vec4(1.0, -1.0, 2.0, -2.0) * floor(vec4(-1.5, 1.5, -4.5, 4.5) / vec4(1.0, -1.0, 2.0, -2.0))",
        ),
        glslFormulaBroadcast: render(
          "vec4(-1.5, 1.5, -4.5, 4.5) - vec4(-2.0) * floor(vec4(-1.5, 1.5, -4.5, 4.5) / vec4(-2.0))",
        ),
        wgsl,
      };
    }),
  );

  const expected = {
    scalar: [0.5, -0.5, -0.5, 0],
    vector: [0.5, -0.5, 1.5, -1.5],
    broadcast: [-1.5, -0.5, -0.5, -1.5],
  };
  for (const [actual, values] of [
    [result.glslNativeScalar, expected.scalar],
    [result.glslNativeVector, expected.vector],
    [result.glslFormulaScalar, expected.scalar],
    [result.glslFormulaVector, expected.vector],
    [result.glslFormulaBroadcast, expected.broadcast],
  ] as const) {
    actual.forEach((value, index) =>
      expect(value).toBeCloseTo(values[index]!, 1),
    );
  }
  expect(result.wgsl).toHaveLength(16);
  [...expected.scalar, ...expected.vector, ...expected.broadcast].forEach(
    (value, index) => expect(result.wgsl[index]!).toBeCloseTo(value, 5),
  );
  console.info("orbit mod numeric observations", JSON.stringify(result));
});

it("records endpoint, unknown-input, and eager-constant observations", async () => {
  const result = await withBrowser((page) =>
    page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const compileGLSL = (expression: string) => {
        const shader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!shader) throw new Error("Could not create WebGL shader");
        gl.shaderSource(
          shader,
          `#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { float s = 0.5; float r = ${expression}; color = vec4(r); }`,
        );
        gl.compileShader(shader);
        const error = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? null
          : gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        return error;
      };
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const compileWGSL = async (expression: string, helper = false) => {
          const prefix = helper
            ? "fn evaluate(a: f32) -> f32 { return asin(a); }"
            : "";
          const call = helper ? `evaluate(${expression})` : expression;
          const module = device.createShaderModule({
            code: `${prefix}\n@fragment fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> { let r: f32 = ${call}; return vec4<f32>(r); }`,
          });
          const info = await module.getCompilationInfo();
          return info.messages
            .filter((message) => message.type === "error")
            .map((message) => message.message);
        };
        const valid = {
          asinPositiveEndpoint: {
            glsl: compileGLSL("asin(1.0)"),
            wgsl: await compileWGSL("asin(1.0f)"),
          },
          asinNegativeEndpoint: {
            glsl: compileGLSL("asin(-1.0)"),
            wgsl: await compileWGSL("asin(-1.0f)"),
          },
          acosNegativeEndpoint: {
            glsl: compileGLSL("acos(-1.0)"),
            wgsl: await compileWGSL("acos(-1.0f)"),
          },
          acosPositiveEndpoint: {
            glsl: compileGLSL("acos(1.0)"),
            wgsl: await compileWGSL("acos(1.0f)"),
          },
          binaryNegativeAxis: {
            glsl: compileGLSL("atan(0.0, -1.0)"),
            wgsl: await compileWGSL("atan2(0.0f, -1.0f)"),
          },
          radians: {
            glsl: compileGLSL("radians(180.0)"),
            wgsl: await compileWGSL("radians(180.0f)"),
          },
          degrees: {
            glsl: compileGLSL("degrees(3.1415927)"),
            wgsl: await compileWGSL("degrees(3.1415927f)"),
          },
        };
        const observations: Record<string, unknown> = { valid };
        const cases = {
          asinOutside: "asin(1.1)",
          acosOutside: "acos(-1.1)",
          asinNonFiniteCompound: "asin(2e38 + 2e38)",
        };
        for (const [name, expression] of Object.entries(cases)) {
          observations[name] = {
            glsl: compileGLSL(expression),
            wgslDirect: await compileWGSL(expression.replaceAll("e", "e")),
            wgslHelper: await compileWGSL(expression, true),
          };
        }
        const unknown = {
          glsl: compileGLSL("asin(gl_FragCoord.x)"),
          wgslDirect: await compileWGSL("asin(position.x)"),
          wgslHelper: await compileWGSL("position.x", true),
        };
        observations.unknown = unknown;
        return observations;
      } finally {
        device.destroy();
      }
    }),
  );

  expect(result.valid).toEqual({
    asinPositiveEndpoint: { glsl: null, wgsl: [] },
    asinNegativeEndpoint: { glsl: null, wgsl: [] },
    acosNegativeEndpoint: { glsl: null, wgsl: [] },
    acosPositiveEndpoint: { glsl: null, wgsl: [] },
    binaryNegativeAxis: { glsl: null, wgsl: [] },
    radians: { glsl: null, wgsl: [] },
    degrees: { glsl: null, wgsl: [] },
  });
  expect(result.unknown).toEqual({
    glsl: null,
    wgslDirect: [],
    wgslHelper: [],
  });
  console.info("orbit endpoint/constant observations", JSON.stringify(result));
});

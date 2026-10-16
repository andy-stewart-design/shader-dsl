import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { expect, it } from "vitest";

const WIDTH = 22;
const HUE_SIZE = 64;
const PI = Math.PI;

const cases = [
  [1, 2],
  [2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
  [-1, 2],
  [-2, 1],
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, -1],
  [-0, -1],
  [0, 1],
  [-0, 1],
  [1e-6, 1e-6],
  [-1e-6, 1e-6],
  [1e-20, -1e-20],
  [1e-6, -1],
  [-1e-6, -1],
  [0, 0],
] as const;

function floatBits(value: number): number {
  const bytes = new ArrayBuffer(4);
  new DataView(bytes).setFloat32(0, value, true);
  return new DataView(bytes).getUint32(0, true);
}

const inputBits = Uint32Array.from([
  ...cases.map(([y]) => floatBits(y)),
  ...cases.map(([, x]) => floatBits(x)),
]);

const vertexGlsl = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const vertexWgsl = `@vertex
fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let vertices = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(vertices[index], 0.0, 1.0);
}`;

const guardedGlsl = `
float guarded_atan(float y, float x) {
  const float pi = 3.14159265;
  if (x == 0.0) {
    if (y > 0.0) return pi * 0.5;
    if (y < 0.0) return -pi * 0.5;
    return 0.0;
  }
  if (y == 0.0) return x > 0.0 ? 0.0 : pi;
  if (x > 0.0) return atan(y / x);
  return y > 0.0 ? atan(y / x) + pi : atan(y / x) - pi;
}`;
const guardedWgsl = `
fn guarded_atan(y: f32, x: f32) -> f32 {
  let pi = 3.14159265;
  if (x == 0.0) {
    if (y > 0.0) { return pi * 0.5; }
    if (y < 0.0) { return -pi * 0.5; }
    return 0.0;
  }
  if (y == 0.0) { return select(pi, 0.0, x > 0.0); }
  if (x > 0.0) { return atan(y / x); }
  return select(atan(y / x) - pi, atan(y / x) + pi, y > 0.0);
}`;

function numericGlsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native" ? "atan(y, x)" : "guarded_atan(y, x)";
  return `#version 300 es
precision highp float;
precision highp int;
out vec4 color;
uniform uint inputs[${inputBits.length}];
${candidate === "guarded" ? guardedGlsl : ""}
vec4 encode(float value) {
  uint bits = floatBitsToUint(value);
  return vec4(float(bits & 255u), float((bits >> 8u) & 255u), float((bits >> 16u) & 255u), float((bits >> 24u) & 255u)) / 255.0;
}
void main() {
  int index = int(gl_FragCoord.x);
  float y = uintBitsToFloat(inputs[index]);
  float x = uintBitsToFloat(inputs[index + ${cases.length}]);
  color = encode(${expression});
}`;
}

function numericWgsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native" ? "atan2(y, x)" : "guarded_atan(y, x)";
  return `${candidate === "guarded" ? guardedWgsl : ""}
@group(0) @binding(0) var<storage, read> inputs: array<u32>;
fn encode(value: f32) -> vec4<f32> {
  let bits = bitcast<u32>(value);
  return vec4<f32>(f32(bits & 255u), f32((bits >> 8u) & 255u), f32((bits >> 16u) & 255u), f32((bits >> 24u) & 255u)) / 255.0;
}
@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let index = u32(position.x);
  let y = bitcast<f32>(inputs[index]);
  let x = bitcast<f32>(inputs[index + ${cases.length}u]);
  return encode(${expression});
}`;
}

function casesGlsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native" ? "atan(y, x)" : "guarded_atan(y, x)";
  return `#version 300 es
precision highp float;
out vec4 color;
uniform uint inputs[${inputBits.length}];
${candidate === "guarded" ? guardedGlsl : ""}
void main() {
  int index = int(gl_FragCoord.x);
  float y = uintBitsToFloat(inputs[index]);
  float x = uintBitsToFloat(inputs[index + ${cases.length}]);
  float angle = ${expression};
  color = vec4(0.5 + 0.5 * cos(angle + vec3(0.0, 2.0943951, 4.1887902)), 1.0);
}`;
}

function casesWgsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native" ? "atan2(y, x)" : "guarded_atan(y, x)";
  return `${candidate === "guarded" ? guardedWgsl : ""}
@group(0) @binding(0) var<storage, read> inputs: array<u32>;
@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let index = u32(position.x);
  let y = bitcast<f32>(inputs[index]);
  let x = bitcast<f32>(inputs[index + ${cases.length}u]);
  let angle = ${expression};
  return vec4<f32>(0.5 + 0.5 * cos(angle + vec3<f32>(0.0, 2.0943951, 4.1887902)), 1.0);
}`;
}

function hueGlsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native" ? "atan(p.y, p.x)" : "guarded_atan(p.y, p.x)";
  return `#version 300 es
precision highp float;
out vec4 color;
${candidate === "guarded" ? guardedGlsl : ""}
void main() {
  vec2 p = (gl_FragCoord.xy - vec2(${(HUE_SIZE / 2).toFixed(1)})) / ${(HUE_SIZE / 2).toFixed(1)};
  float angle = ${expression};
  color = vec4(0.5 + 0.5 * cos(angle + vec3(0.0, 2.0943951, 4.1887902)), 1.0);
}`;
}

function hueWgsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native" ? "atan2(p.y, p.x)" : "guarded_atan(p.y, p.x)";
  return `${candidate === "guarded" ? guardedWgsl : ""}
@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let p = (position.xy - vec2<f32>(${(HUE_SIZE / 2).toFixed(1)})) / ${(HUE_SIZE / 2).toFixed(1)};
  let angle = ${expression};
  return vec4<f32>(0.5 + 0.5 * cos(angle + vec3<f32>(0.0, 2.0943951, 4.1887902)), 1.0);
}`;
}

function vectorGlsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native"
      ? "atan(y, x)"
      : "vec4(guarded_atan(y.x, x.x), guarded_atan(y.y, x.y), guarded_atan(y.z, x.z), guarded_atan(y.w, x.w))";
  return `#version 300 es
precision highp float;
out vec4 color;
${candidate === "guarded" ? guardedGlsl : ""}
vec4 encode(float value) {
  uint bits = floatBitsToUint(value);
  return vec4(float(bits & 255u), float((bits >> 8u) & 255u), float((bits >> 16u) & 255u), float((bits >> 24u) & 255u)) / 255.0;
}
void main() {
  vec4 y = vec4(1.0, -1.0, 0.0, 1.0);
  vec4 x = vec4(2.0, -2.0, -1.0, 0.0);
  vec4 result = ${expression};
  color = encode(result[int(gl_FragCoord.x)]);
}`;
}

function vectorWgsl(candidate: "native" | "guarded"): string {
  const expression =
    candidate === "native"
      ? "atan2(y, x)"
      : "vec4<f32>(guarded_atan(y.x, x.x), guarded_atan(y.y, x.y), guarded_atan(y.z, x.z), guarded_atan(y.w, x.w))";
  return `${candidate === "guarded" ? guardedWgsl : ""}
fn encode(value: f32) -> vec4<f32> {
  let bits = bitcast<u32>(value);
  return vec4<f32>(f32(bits & 255u), f32((bits >> 8u) & 255u), f32((bits >> 16u) & 255u), f32((bits >> 24u) & 255u)) / 255.0;
}
@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let y = vec4<f32>(1.0, -1.0, 0.0, 1.0);
  let x = vec4<f32>(2.0, -2.0, -1.0, 0.0);
  let result = ${expression};
  return encode(result[u32(position.x)]);
}`;
}

async function withBrowser<T>(
  callback: (page: Page) => Promise<T>,
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
      route.fulfill({
        body: `<style>canvas { display: block; }</style>
          <canvas id="glNativeNumeric" width="${WIDTH}" height="1"></canvas>
          <canvas id="glGuardedNumeric" width="${WIDTH}" height="1"></canvas>
          <canvas id="gpuNativeNumeric" width="${WIDTH}" height="1"></canvas>
          <canvas id="gpuGuardedNumeric" width="${WIDTH}" height="1"></canvas>
          <canvas id="glNativeCases" width="${WIDTH}" height="1"></canvas>
          <canvas id="glGuardedCases" width="${WIDTH}" height="1"></canvas>
          <canvas id="gpuNativeCases" width="${WIDTH}" height="1"></canvas>
          <canvas id="gpuGuardedCases" width="${WIDTH}" height="1"></canvas>
          <canvas id="glNativeVector" width="4" height="1"></canvas>
          <canvas id="glGuardedVector" width="4" height="1"></canvas>
          <canvas id="gpuNativeVector" width="4" height="1"></canvas>
          <canvas id="gpuGuardedVector" width="4" height="1"></canvas>
          <canvas id="glNativeHue" width="${HUE_SIZE}" height="${HUE_SIZE}"></canvas>
          <canvas id="glGuardedHue" width="${HUE_SIZE}" height="${HUE_SIZE}"></canvas>
          <canvas id="gpuNativeHue" width="${HUE_SIZE}" height="${HUE_SIZE}"></canvas>
          <canvas id="gpuGuardedHue" width="${HUE_SIZE}" height="${HUE_SIZE}"></canvas>`,
      }),
    );
    await page.goto("http://localhost/");
    return await callback(page);
  } finally {
    await browser.close();
  }
}

async function decodeScreenshot(
  page: Page,
  screenshot: Uint8Array,
  positions: readonly (readonly [number, number])[],
) {
  return page.evaluate(
    async ({ bytes, positions }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create screenshot decoder");
      context.drawImage(image, 0, 0);
      return positions.map(([x, y]) => [
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    },
    { bytes: [...screenshot], positions },
  );
}

function decodeFloat(bytes: readonly number[]): number {
  const bits =
    (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>>
    0;
  const data = new DataView(new ArrayBuffer(4));
  data.setUint32(0, bits, true);
  return data.getFloat32(0, true);
}

it("compares native and guarded binary atan on both raw targets", async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(
      async ({ glsl, wgsl, vectorGlsl, vectorWgsl, bits }) => {
        const vertexGlsl = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
        const vertexWgsl = `@vertex
fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let vertices = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(vertices[index], 0.0, 1.0);
}`;
        const compile = (
          gl: WebGL2RenderingContext,
          source: string,
          type: number,
        ) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Could not create GLSL shader");
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(shader) ?? "GLSL compile failed",
            );
          return shader;
        };
        const renderGl = (
          id: string,
          fragment: string,
          inputBits?: number[],
        ) => {
          const canvas = document.querySelector(`#${id}`) as HTMLCanvasElement;
          const gl = canvas.getContext("webgl2");
          if (!gl) throw new Error("WebGL 2 unavailable");
          const vertex = compile(gl, vertexGlsl, gl.VERTEX_SHADER);
          const shader = compile(gl, fragment, gl.FRAGMENT_SHADER);
          const program = gl.createProgram();
          if (!program) throw new Error("Could not create GLSL program");
          gl.attachShader(program, vertex);
          gl.attachShader(program, shader);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error(
              gl.getProgramInfoLog(program) ?? "GLSL link failed",
            );
          gl.useProgram(program);
          if (inputBits) {
            const location = gl.getUniformLocation(program, "inputs");
            if (!location) throw new Error("GLSL input uniform unavailable");
            gl.uniform1uiv(location, new Uint32Array(inputBits));
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.finish();
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          if (gl.getError() !== gl.NO_ERROR)
            throw new Error("WebGL readback failed");
          return [...pixels];
        };
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        const format = navigator.gpu!.getPreferredCanvasFormat();
        const renderGpu = async (
          id: string,
          fragment: string,
          inputBits?: number[],
          readback = false,
        ) => {
          const canvas = document.querySelector(`#${id}`) as HTMLCanvasElement;
          const targetFormat = readback ? "rgba8unorm" : format;
          const context = readback
            ? null
            : (canvas.getContext("webgpu") as any);
          if (!readback && !context)
            throw new Error("WebGPU canvas unavailable");
          context?.configure({
            device,
            format: targetFormat,
            alphaMode: "opaque",
          });
          const module = device.createShaderModule({
            code: `${vertexWgsl}\n${fragment}`,
          });
          const info = await module.getCompilationInfo();
          const errors = info.messages.filter(
            (message) => message.type === "error",
          );
          if (errors.length)
            throw new Error(
              errors.map((message) => message.message).join("\n"),
            );
          const pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module, entryPoint: "vertex" },
            fragment: {
              module,
              entryPoint: "fragment",
              targets: [{ format: targetFormat }],
            },
            primitive: { topology: "triangle-list" },
          });
          const flags = globalThis as typeof globalThis & {
            GPUBufferUsage: {
              STORAGE: number;
              COPY_DST: number;
              COPY_SRC: number;
              MAP_READ: number;
            };
            GPUTextureUsage: { RENDER_ATTACHMENT: number; COPY_SRC: number };
            GPUMapMode: { READ: number };
          };
          let inputBuffer: GPUBuffer | undefined;
          let bindGroup: GPUBindGroup | undefined;
          if (inputBits) {
            inputBuffer = device.createBuffer({
              size: inputBits.length * 4,
              usage:
                flags.GPUBufferUsage.STORAGE | flags.GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(
              inputBuffer,
              0,
              new Uint32Array(inputBits),
            );
            bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: inputBuffer } }],
            });
          }
          const target = readback
            ? device.createTexture({
                size: { width: canvas.width, height: canvas.height },
                format: targetFormat,
                usage:
                  flags.GPUTextureUsage.RENDER_ATTACHMENT |
                  flags.GPUTextureUsage.COPY_SRC,
              })
            : null;
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: (target ?? context!.getCurrentTexture()).createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          pass.setPipeline(pipeline);
          if (bindGroup) pass.setBindGroup(0, bindGroup);
          pass.draw(3);
          pass.end();
          let readbackBuffer: GPUBuffer | undefined;
          if (target) {
            readbackBuffer = device.createBuffer({
              size: 256,
              usage:
                flags.GPUBufferUsage.COPY_DST | flags.GPUBufferUsage.MAP_READ,
            });
            encoder.copyTextureToBuffer(
              { texture: target },
              { buffer: readbackBuffer, bytesPerRow: 256 },
              { width: canvas.width, height: canvas.height },
            );
          }
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          let pixels: number[] | undefined;
          if (readbackBuffer) {
            await readbackBuffer.mapAsync(flags.GPUMapMode.READ);
            pixels = [
              ...new Uint8Array(readbackBuffer.getMappedRange()).slice(
                0,
                canvas.width * canvas.height * 4,
              ),
            ];
            readbackBuffer.unmap();
            readbackBuffer.destroy();
          }
          inputBuffer?.destroy();
          target?.destroy();
          return pixels;
        };
        const glNative = renderGl("glNativeNumeric", glsl.native, bits);
        const glGuarded = renderGl("glGuardedNumeric", glsl.guarded, bits);
        const glNativeCases = renderGl("glNativeCases", glsl.casesNative, bits);
        const glGuardedCases = renderGl(
          "glGuardedCases",
          glsl.casesGuarded,
          bits,
        );
        const glVectorNative = renderGl("glNativeVector", vectorGlsl.native);
        const glVectorGuarded = renderGl("glGuardedVector", vectorGlsl.guarded);
        const gpuNativeNumeric = await renderGpu(
          "gpuNativeNumeric",
          wgsl.native,
          bits,
          true,
        );
        const gpuGuardedNumeric = await renderGpu(
          "gpuGuardedNumeric",
          wgsl.guarded,
          bits,
          true,
        );
        await renderGpu("gpuNativeCases", wgsl.casesNative, bits);
        await renderGpu("gpuGuardedCases", wgsl.casesGuarded, bits);
        const gpuVectorNative = await renderGpu(
          "gpuNativeVector",
          vectorWgsl.native,
          undefined,
          true,
        );
        const gpuVectorGuarded = await renderGpu(
          "gpuGuardedVector",
          vectorWgsl.guarded,
          undefined,
          true,
        );
        await renderGpu("gpuNativeHue", wgsl.hueNative);
        await renderGpu("gpuGuardedHue", wgsl.hueGuarded);
        const glNativeHue = renderGl("glNativeHue", glsl.hueNative);
        const glGuardedHue = renderGl("glGuardedHue", glsl.hueGuarded);
        device.destroy();
        return {
          glNative,
          glGuarded,
          glNativeCases,
          glGuardedCases,
          glVectorNative,
          glVectorGuarded,
          gpuNativeNumeric,
          gpuGuardedNumeric,
          gpuVectorNative,
          gpuVectorGuarded,
          glNativeHue,
          glGuardedHue,
        };
      },
      {
        glsl: {
          native: numericGlsl("native"),
          guarded: numericGlsl("guarded"),
          casesNative: casesGlsl("native"),
          casesGuarded: casesGlsl("guarded"),
          hueNative: hueGlsl("native"),
          hueGuarded: hueGlsl("guarded"),
        },
        wgsl: {
          native: numericWgsl("native"),
          guarded: numericWgsl("guarded"),
          casesNative: casesWgsl("native"),
          casesGuarded: casesWgsl("guarded"),
          hueNative: hueWgsl("native"),
          hueGuarded: hueWgsl("guarded"),
        },
        vectorGlsl: {
          native: vectorGlsl("native"),
          guarded: vectorGlsl("guarded"),
        },
        vectorWgsl: {
          native: vectorWgsl("native"),
          guarded: vectorWgsl("guarded"),
        },
        bits: [...inputBits],
      },
    );

    if (!result.gpuNativeNumeric || !result.gpuGuardedNumeric)
      throw new Error("Missing WebGPU numeric readback");
    const gpuNativeNumeric = result.gpuNativeNumeric;
    const gpuGuardedNumeric = result.gpuGuardedNumeric;
    const glNativeValues = cases.map((_, index) =>
      decodeFloat(result.glNative.slice(index * 4, index * 4 + 4)),
    );
    const glGuardedValues = cases.map((_, index) =>
      decodeFloat(result.glGuarded.slice(index * 4, index * 4 + 4)),
    );
    const gpuNativeValues = cases.map((_, index) =>
      decodeFloat(gpuNativeNumeric.slice(index * 4, index * 4 + 4)),
    );
    const gpuGuardedValues = cases.map((_, index) =>
      decodeFloat(gpuGuardedNumeric.slice(index * 4, index * 4 + 4)),
    );

    const ordinary = cases.slice(0, 8).map(([y, x]) => Math.atan2(y, x));
    console.info(
      "orbit atan decoded numeric",
      JSON.stringify({
        glNativeValues,
        glGuardedValues,
        gpuNativeValues,
        gpuGuardedValues,
      }),
    );
    for (const values of [
      glNativeValues,
      glGuardedValues,
      gpuNativeValues,
      gpuGuardedValues,
    ]) {
      values
        .slice(0, 8)
        .forEach((value, index) =>
          expect(value).toBeCloseTo(ordinary[index]!, 5),
        );
    }
    for (const [native, guarded] of [
      [glNativeValues, glGuardedValues],
      [gpuNativeValues, gpuGuardedValues],
    ] as const) {
      native
        .slice(0, 8)
        .forEach((value, index) =>
          expect(value).toBeCloseTo(guarded[index]!, 5),
        );
    }

    if (!result.gpuVectorNative || !result.gpuVectorGuarded)
      throw new Error("Missing WebGPU vector readback");
    const vectorNative = result.gpuVectorNative;
    const vectorGuarded = result.gpuVectorGuarded;
    expect(result.glVectorNative).toHaveLength(16);
    expect(result.glVectorGuarded).toHaveLength(16);
    expect(vectorNative).toHaveLength(16);
    expect(vectorGuarded).toHaveLength(16);
    const glVectorNativeValues = [0, 1, 2, 3].map((index) =>
      decodeFloat(result.glVectorNative!.slice(index * 4, index * 4 + 4)),
    );
    const glVectorGuardedValues = [0, 1, 2, 3].map((index) =>
      decodeFloat(result.glVectorGuarded!.slice(index * 4, index * 4 + 4)),
    );
    const gpuVectorNativeValues = [0, 1, 2, 3].map((index) =>
      decodeFloat(vectorNative.slice(index * 4, index * 4 + 4)),
    );
    const gpuVectorGuardedValues = [0, 1, 2, 3].map((index) =>
      decodeFloat(vectorGuarded.slice(index * 4, index * 4 + 4)),
    );
    const vectorExpected = [
      Math.atan2(1, 2),
      Math.atan2(-1, -2),
      Math.atan2(0, -1),
      Math.atan2(1, 0),
    ];
    for (const values of [
      glVectorNativeValues,
      glVectorGuardedValues,
      gpuVectorNativeValues,
      gpuVectorGuardedValues,
    ]) {
      values.forEach((value, index) =>
        expect(value).toBeCloseTo(vectorExpected[index]!, 5),
      );
    }
    for (const [native, guarded] of [
      [glVectorNativeValues, glVectorGuardedValues],
      [gpuVectorNativeValues, gpuVectorGuardedValues],
    ] as const) {
      native.forEach((value, index) =>
        expect(value).toBeCloseTo(guarded[index]!, 5),
      );
    }

    const huePositions = [
      [1, 1],
      [16, 16],
      [31, 16],
      [32, 16],
      [48, 16],
      [16, 31],
      [16, 32],
      [16, 48],
      [48, 48],
    ] as const;
    const hueScreenshots = await Promise.all(
      ["glNativeHue", "glGuardedHue", "gpuNativeHue", "gpuGuardedHue"].map(
        async (id) =>
          decodeScreenshot(
            page,
            await page.locator(`#${id}`).screenshot(),
            huePositions,
          ),
      ),
    );
    for (const [native, guarded] of [
      [hueScreenshots[0]!, hueScreenshots[1]!],
      [hueScreenshots[2]!, hueScreenshots[3]!],
    ]) {
      expect(native).toBeDefined();
      expect(guarded).toBeDefined();
      if (!native || !guarded) throw new Error("Missing hue screenshot");
      native.forEach((pixel, index) =>
        pixel.forEach((value, channel) =>
          expect(
            Math.abs(value - guarded[index]![channel]!),
          ).toBeLessThanOrEqual(2),
        ),
      );
    }

    if (process.env.SHDR_ORBIT_ATAN_CAPTURE === "1") {
      const directory = new URL(
        "../../../plans/orbit-trigonometry/evidence/atan-comparison/",
        import.meta.url,
      );
      await mkdir(directory, { recursive: true });
      const captures = [
        ["glNativeHue", "webgl-native-hue.png"],
        ["glGuardedHue", "webgl-guarded-hue.png"],
        ["gpuNativeHue", "webgpu-native-hue.png"],
        ["gpuGuardedHue", "webgpu-guarded-hue.png"],
        ["glNativeCases", "webgl-native-cases.png"],
        ["glGuardedCases", "webgl-guarded-cases.png"],
        ["gpuNativeCases", "webgpu-native-cases.png"],
        ["gpuGuardedCases", "webgpu-guarded-cases.png"],
      ] as const;
      for (const [id, filename] of captures)
        await writeFile(
          new URL(filename, directory),
          await page.locator(`#${id}`).screenshot(),
        );
      const labels = cases
        .map(
          ([y, x], index) =>
            `<li>${index}: (${Object.is(y, -0) ? "-0" : y}, ${Object.is(x, -0) ? "-0" : x})</li>`,
        )
        .join("\n");
      await writeFile(
        new URL("index.html", directory),
        `<!doctype html><meta charset="utf-8"><title>Binary atan comparison</title><style>body{font:16px sans-serif}section{display:inline-block;vertical-align:top;margin:1rem}img{display:block;image-rendering:pixelated;border:1px solid #888}#fields img{width:384px;height:384px}#cases img{width:660px;height:30px}</style><h1>Binary atan native vs guarded</h1><div id="fields"><section><h2>WebGL native</h2><img src="webgl-native-hue.png"></section><section><h2>WebGL guarded</h2><img src="webgl-guarded-hue.png"></section><section><h2>WebGPU native</h2><img src="webgpu-native-hue.png"></section><section><h2>WebGPU guarded</h2><img src="webgpu-guarded-hue.png"></section></div><div id="cases"><section><h2>WebGL case strip: native / guarded</h2><img src="webgl-native-cases.png"><img src="webgl-guarded-cases.png"></section><section><h2>WebGPU case strip: native / guarded</h2><img src="webgpu-native-cases.png"><img src="webgpu-guarded-cases.png"></section></div><ol>${labels}</ol>`,
      );
      console.info(`Saved visual comparison to ${directory.pathname}`);
    }

    console.info(
      "orbit atan observations",
      JSON.stringify({
        glNativeValues,
        glGuardedValues,
        gpuNativeValues,
        gpuGuardedValues,
      }),
    );
    console.info(
      "orbit atan vector observations",
      JSON.stringify({
        glVectorNativeValues,
        glVectorGuardedValues,
        gpuVectorNativeValues,
        gpuVectorGuardedValues,
      }),
    );
    console.info(
      "orbit atan hue comparison",
      JSON.stringify(
        huePositions.map((position, index) => ({
          position,
          glNative: hueScreenshots[0]![index],
          glGuarded: hueScreenshots[1]![index],
          gpuNative: hueScreenshots[2]![index],
          gpuGuarded: hueScreenshots[3]![index],
        })),
      ),
    );
  });
});

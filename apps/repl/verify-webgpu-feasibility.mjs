import assert from "node:assert/strict";
import { compileFragment } from "@shdr/core";
import { chromium } from "playwright";

// Phase 1 only: prove that *generated Shdr WGSL* can draw into a WebGPU
// canvas and that its actual color attachment can be read back. This is not
// the REPL renderer or its resource/async lifecycle.
const sources = [
  {
    name: "constant color (no uniforms)",
    body: "return vec4(0.25, 0.5, 0.75, 1);",
    boundResolution: false,
    expected: {
      topLeft: [64, 128, 191, 255],
      topRight: [64, 128, 191, 255],
      bottomLeft: [64, 128, 191, 255],
      bottomRight: [64, 128, 191, 255],
    },
  },
  {
    name: "fragment position (no implicit WGSL resolution binding)",
    body: "return vec4(coord.x / 4, coord.y / 4, 0, 1);",
    boundResolution: false,
    expected: {
      topLeft: [32, 32, 0, 255],
      topRight: [223, 32, 0, 255],
      bottomLeft: [32, 223, 0, 255],
      bottomRight: [223, 223, 0, 255],
    },
  },
  {
    name: "normalized position (resolution at group 0, binding 0)",
    body: "const uv = coord.xy / uniforms.resolution; return vec4(uv.x, uv.y, 0, 1);",
    boundResolution: true,
    expected: {
      topLeft: [32, 32, 0, 255],
      topRight: [223, 32, 0, 255],
      bottomLeft: [32, 223, 0, 255],
      bottomRight: [223, 223, 0, 255],
    },
  },
];

const shaders = sources.map(({ name, body, boundResolution, expected }) => {
  const source = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});`;
  const wgsl = compileFragment(source, { target: "wgsl" });
  const glsl = compileFragment(source, { target: "glsl-es-300" });
  assert.equal(wgsl.ok, true, `${name}: ${JSON.stringify(wgsl.diagnostics)}`);
  assert.equal(glsl.ok, true, `${name}: ${JSON.stringify(glsl.diagnostics)}`);
  assert.deepEqual(wgsl.ir, glsl.ir);
  assert.equal(wgsl.code.includes("@group(0) @binding(0)"), boundResolution);
  assert.equal(wgsl.code.includes("@group(0) @binding(1)"), false);
  assert.equal(wgsl.code.includes("@group(0) @binding(2)"), false);
  return { name, code: wgsl.code, boundResolution, expected };
});

const vertex = `@vertex
fn main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let vertices = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(vertices[index], 0.0, 1.0);
}`;

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
      body: '<!doctype html><canvas id="webgl"></canvas><canvas id="webgpu"></canvas>',
    }),
  );
  await page.goto("http://localhost/");
  const results = await page.evaluate(
    async ({ shaders, vertex }) => {
      const width = 4;
      const height = 4;
      // WebGL and WebGPU must have separate canvases; don't modify the REPL UI
      // until the canvas path is proven.
      const glCanvas = document.querySelector("#webgl");
      if (
        !(glCanvas instanceof HTMLCanvasElement) ||
        !glCanvas.getContext("webgl2")
      ) {
        throw new Error("The separate WebGL 2 canvas is unavailable");
      }
      const canvas = document.querySelector("#webgpu");
      if (!(canvas instanceof HTMLCanvasElement))
        throw new Error("WebGPU canvas is missing");
      canvas.width = width;
      canvas.height = height;
      if (!navigator.gpu) throw new Error("navigator.gpu is unavailable");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter");
      const device = await adapter.requestDevice();
      const context = canvas.getContext("webgpu");
      if (!context) throw new Error("WebGPU canvas context unavailable");
      const format = navigator.gpu.getPreferredCanvasFormat();
      // If COPY_SRC cannot be configured on a canvas, Gate 1 must choose and
      // document an offscreen alternative rather than claiming rendered pixels.
      context.configure({
        device,
        format,
        alphaMode: "opaque",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const bytesPerRow = 256; // WebGPU copy-to-buffer row stride alignment.
      const vertexModule = device.createShaderModule({ code: vertex });
      const checked = [];
      try {
        for (const { name, code, boundResolution } of shaders) {
          const fragmentModule = device.createShaderModule({ code });
          const info = await fragmentModule.getCompilationInfo();
          const errors = info.messages.filter(
            (message) => message.type === "error",
          );
          if (errors.length)
            throw new Error(
              `${name}: WGSL: ${errors.map((error) => error.message).join("; ")}`,
            );
          device.pushErrorScope("validation");
          let pipeline;
          let pipelineFailure;
          try {
            pipeline = await device.createRenderPipelineAsync({
              layout: "auto",
              vertex: { module: vertexModule, entryPoint: "main" },
              fragment: {
                module: fragmentModule,
                entryPoint: "shdr_fragment_main",
                targets: [{ format }],
              },
              primitive: { topology: "triangle-list" },
            });
          } catch (error) {
            pipelineFailure = error;
          }
          const pipelineError = await device.popErrorScope();
          if (!pipeline || pipelineError) {
            throw new Error(
              `${name}: pipeline: ${pipelineError?.message ?? String(pipelineFailure)}`,
            );
          }
          let uniform;
          let bindGroup;
          if (boundResolution) {
            uniform = device.createBuffer({
              size: 8,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(
              uniform,
              0,
              new Float32Array([width, height]),
            );
            bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: uniform } }],
            });
          }
          const readback = device.createBuffer({
            size: bytesPerRow * height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
          try {
            device.pushErrorScope("validation");
            const encoder = device.createCommandEncoder();
            const texture = context.getCurrentTexture();
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: texture.createView(),
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
            encoder.copyTextureToBuffer(
              { texture },
              { buffer: readback, bytesPerRow, rowsPerImage: height },
              { width, height },
            );
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const error = await device.popErrorScope();
            if (error) throw new Error(`${name}: render: ${error.message}`);
            const data = new Uint8Array(readback.getMappedRange());
            const pixel = (x, y) => {
              const offset = y * bytesPerRow + x * 4;
              const [a, b, c, d] = data.subarray(offset, offset + 4);
              return format === "bgra8unorm" ? [c, b, a, d] : [a, b, c, d];
            };
            checked.push({
              name,
              pixels: {
                topLeft: pixel(0, 0),
                topRight: pixel(3, 0),
                bottomLeft: pixel(0, 3),
                bottomRight: pixel(3, 3),
              },
            });
            readback.unmap();
          } finally {
            readback.destroy();
            uniform?.destroy();
          }
        }
        return { format, bytesPerRow, checked };
      } finally {
        context.unconfigure();
        device.destroy();
      }
    },
    { shaders, vertex },
  );

  assert.ok(
    ["bgra8unorm", "rgba8unorm"].includes(results.format),
    results.format,
  );
  assert.equal(results.bytesPerRow % 256, 0);
  for (const [index, result] of results.checked.entries()) {
    const expected = shaders[index].expected;
    for (const [position, rgba] of Object.entries(expected)) {
      assert.deepEqual(
        result.pixels[position],
        rgba,
        `${result.name} ${position}`,
      );
    }
  }
  console.log(
    `Chromium ${browser.version()}: WebGPU canvas rendered and read back ${results.checked.length} generated Shdr shaders (${results.format}, ${results.bytesPerRow}-byte rows).`,
  );
} finally {
  await browser.close();
}

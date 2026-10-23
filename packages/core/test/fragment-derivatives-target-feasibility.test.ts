import { chromium } from "playwright";
import { expect, it } from "vitest";

// Raw target probes only: deliberately bypass Shdr types, lowering and emitters.
const glsl = `#version 300 es
precision highp float;
out vec4 color;
float probe(float x) { return dFdy(x); }
vec2 probe(vec2 x) { return dFdy(x); }
vec3 probe(vec3 x) { return dFdy(x); }
vec4 probe(vec4 x) { return dFdy(x); }
float xProbe(float x) { return dFdx(x); }
vec2 xProbe(vec2 x) { return dFdx(x); }
vec3 xProbe(vec3 x) { return dFdx(x); }
vec4 xProbe(vec4 x) { return dFdx(x); }
float widthProbe(float x) { return fwidth(x); }
vec2 widthProbe(vec2 x) { return fwidth(x); }
vec3 widthProbe(vec3 x) { return fwidth(x); }
vec4 widthProbe(vec4 x) { return fwidth(x); }
void main() {
  vec2 coord = vec2(gl_FragCoord.x, 64.0 - gl_FragCoord.y);
  vec2 field2 = vec2(0.5 * coord.x, coord.y);
  vec3 field3 = vec3(0.75 * coord.x, 1.25 * coord.y, 1.5 * coord.x);
  vec4 field4 = vec4(0.5 * coord.x, coord.y, 1.5 * coord.x, 2.0 * coord.y);
  float scalarSignature = xProbe(coord.x) - probe(coord.y) + widthProbe(coord.x);
  vec2 signature2 = xProbe(field2) - probe(field2) + widthProbe(field2);
  vec3 signature3 = xProbe(field3) - probe(field3) + widthProbe(field3);
  vec4 signature4 = xProbe(field4) - probe(field4) + widthProbe(field4);
  vec4 signature = vec4(scalarSignature, signature2.x + signature2.y,
                        signature3.x + signature3.y + signature3.z,
                        signature4.x + signature4.y + signature4.z + signature4.w);
  float dx = dFdx(coord.x);
  float down = -probe(vec4(coord.x, coord.y, coord.x * 2.0, coord.y * 3.0)).y;
  float reconstructedUp = -probe(64.0 - coord.y);
  vec4 field = vec4(0.5 * coord.x, coord.y, 1.5 * coord.x, 2.0 * coord.y);
  vec4 widths = widthProbe(field);
  float selectedWidth = widths.x;
  if (gl_FragCoord.x >= 24.0) selectedWidth = widths.y;
  if (gl_FragCoord.x >= 48.0) selectedWidth = widths.z;
  if (gl_FragCoord.x >= 72.0) selectedWidth = widths.w;
  color = vec4(0.5 + 0.25 * dx, 0.5 + 0.25 * down,
               0.5 + 0.25 * reconstructedUp, 0.25 + 0.1 * selectedWidth);
  if (gl_FragCoord.y > 32.0) color = vec4(0.25) + 0.05 * signature;
}`;

const wgsl = `fn probe(x: f32) -> f32 { return dpdy(x); }
fn probe2(x: vec2<f32>) -> vec2<f32> { return dpdy(x); }
fn probe3(x: vec3<f32>) -> vec3<f32> { return dpdy(x); }
fn probe4(x: vec4<f32>) -> vec4<f32> { return dpdy(x); }
fn xProbe1(x: f32) -> f32 { return dpdx(x); }
fn xProbe2(x: vec2<f32>) -> vec2<f32> { return dpdx(x); }
fn xProbe3(x: vec3<f32>) -> vec3<f32> { return dpdx(x); }
fn xProbe4(x: vec4<f32>) -> vec4<f32> { return dpdx(x); }
fn widthProbe1(x: f32) -> f32 { return fwidth(x); }
fn widthProbe2(x: vec2<f32>) -> vec2<f32> { return fwidth(x); }
fn widthProbe3(x: vec3<f32>) -> vec3<f32> { return fwidth(x); }
fn widthProbe4(x: vec4<f32>) -> vec4<f32> { return fwidth(x); }
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
 let p = array<vec2<f32>, 3>(vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
 return vec4(p[i],0.0,1.0);
}
@fragment fn fragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let field2 = vec2<f32>(0.5*p.x, p.y);
 let field3 = vec3<f32>(0.75*p.x, 1.25*p.y, 1.5*p.x);
 let field4 = vec4<f32>(0.5*p.x, p.y, 1.5*p.x, 2.0*p.y);
 let scalarSignature = xProbe1(p.x) + probe(p.y) + widthProbe1(p.x);
 let signature2 = xProbe2(field2) + probe2(field2) + widthProbe2(field2);
 let signature3 = xProbe3(field3) + probe3(field3) + widthProbe3(field3);
 let signature4 = xProbe4(field4) + probe4(field4) + widthProbe4(field4);
 let signature = vec4<f32>(scalarSignature, signature2.x + signature2.y,
                           signature3.x + signature3.y + signature3.z,
                           signature4.x + signature4.y + signature4.z + signature4.w);
 let dx = dpdx(p.x);
 let down = probe4(vec4<f32>(p.x, p.y, 2.0*p.x, 3.0*p.y)).y;
 let reconstructedUp = probe(64.0-p.y);
 let field = vec4<f32>(0.5*p.x, p.y, 1.5*p.x, 2.0*p.y);
 let widths = widthProbe4(field);
 var selectedWidth = widths.x;
 if (p.x >= 24.0) { selectedWidth = widths.y; }
 if (p.x >= 48.0) { selectedWidth = widths.z; }
 if (p.x >= 72.0) { selectedWidth = widths.w; }
 if (p.y > 32.0) { return vec4<f32>(0.25) + 0.05 * signature; }
 return vec4<f32>(0.5+0.25*dx, 0.5+0.25*down,
                  0.5+0.25*reconstructedUp, 0.25+0.1*selectedWidth);
}`;

it("compiles, links, and renders raw derivative/helper probes on WebGL 2 and validates a WGSL pipeline", async () => {
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
        contentType: "text/html",
        body: "<!doctype html><html><body><canvas width=96 height=64></canvas></body></html>",
      }),
    );
    // WebGPU requires a secure context; localhost is trustworthy, unlike about:blank.
    await page.goto("http://localhost/");
    const result = await page.evaluate(
      async ({ glsl, wgsl }) => {
        const canvas = document.querySelector("canvas") as HTMLCanvasElement;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type)!;
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(shader) ?? "GLSL compile failed",
            );
          return shader;
        };
        const vs = compile(
          gl.VERTEX_SHADER,
          `#version 300 es\nvoid main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`,
        );
        const fs = compile(gl.FRAGMENT_SHADER, glsl);
        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) ?? "GLSL link failed");
        gl.useProgram(program);
        gl.viewport(0, 0, 96, 64);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const sampleGl = (y: number) =>
          [12, 36, 60, 84].map((x) => {
            const pixel = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return Array.from(pixel);
          });
        const glPixels = sampleGl(16);
        const glSignaturePixels = sampleGl(48);
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const module = device.createShaderModule({ code: wgsl });
          const info = await module.getCompilationInfo();
          const errors = info.messages.filter((m) => m.type === "error");
          if (errors.length)
            throw new Error(errors.map((e) => e.message).join("\n"));
          const pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module, entryPoint: "vertex" },
            fragment: {
              module,
              entryPoint: "fragment",
              targets: [{ format: "rgba8unorm" }],
            },
            primitive: { topology: "triangle-list" },
          });
          const target = device.createTexture({
            size: { width: 96, height: 64 },
            format: "rgba8unorm",
            usage: 0x10 | 0x01,
          }); // RENDER_ATTACHMENT | COPY_SRC
          const bytesPerRow = 512;
          const readback = device.createBuffer({
            size: bytesPerRow * 64,
            usage: 0x08 | 0x01,
          }); // COPY_DST | MAP_READ
          device.pushErrorScope("validation");
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              { view: target.createView(), loadOp: "clear", storeOp: "store" },
            ],
          });
          pass.setPipeline(pipeline);
          pass.draw(3);
          pass.end();
          encoder.copyTextureToBuffer(
            { texture: target },
            { buffer: readback, bytesPerRow },
            { width: 96, height: 64 },
          );
          device.queue.submit([encoder.finish()]);
          const validationError = await device.popErrorScope();
          if (validationError)
            throw new Error(
              `WebGPU validation failed: ${validationError.message}`,
            );
          await readback.mapAsync(0x01); // GPUMapMode.READ
          const gpuBytes = new Uint8Array(readback.getMappedRange());
          const sampleGpu = (y: number) =>
            [12, 36, 60, 84].map((x) => {
              const offset = y * bytesPerRow + x * 4;
              return Array.from(gpuBytes.slice(offset, offset + 4));
            });
          const gpuPixels = sampleGpu(16);
          const gpuSignaturePixels = sampleGpu(48);
          readback.unmap();
          target.destroy();
          readback.destroy();
          return {
            glPixels,
            gpuPixels,
            glSignaturePixels,
            gpuSignaturePixels,
            renderer: gl.getParameter(gl.RENDERER),
            adapter: adapter.info?.description ?? "unknown WebGPU adapter",
            wgslValidated: true,
            wgslPipeline: true,
          };
        } finally {
          device.destroy();
        }
      },
      { glsl, wgsl },
    );
    expect(result.wgslValidated).toBe(true);
    expect(result.wgslPipeline).toBe(true);
    const expectedWidths = [77, 89, 102, 115]; // 0.25 + 0.1 * [0.5, 1, 1.5, 2]
    for (const pixels of [result.glPixels, result.gpuPixels]) {
      pixels.forEach((pixel, index) => {
        for (const [channel, expected] of [
          [pixel[0], 191],
          [pixel[1], 191],
          [pixel[2], 64],
          [pixel[3], expectedWidths[index]!],
        ] as const) {
          expect(channel).toBeGreaterThanOrEqual(expected - 4);
          expect(channel).toBeLessThanOrEqual(expected + 4);
        }
      });
    }
    const expectedSignatures = [102, 102, 153, 191]; // 0.25 + 0.05 * [3, 3, 7, 10]
    for (const pixels of [
      result.glSignaturePixels,
      result.gpuSignaturePixels,
    ]) {
      pixels.forEach((pixel) =>
        pixel.forEach((channel, lane) => {
          expect(channel).toBeGreaterThanOrEqual(expectedSignatures[lane]! - 4);
          expect(channel).toBeLessThanOrEqual(expectedSignatures[lane]! + 4);
        }),
      );
    }
    // Signed channels use 0.5 + 0.25*slope (+/-1 => 191/64); widths use
    // 0.25 + 0.1*width to keep four distinct lane magnitudes unsaturated.
    // Both allow +/-4 byte codes for quantization and observed SwiftShader noise.
    console.info(
      "fragment derivative feasibility target:",
      JSON.stringify(result),
    );
  } finally {
    await browser.close();
  }
}, 60_000);

import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { expect, it } from "vitest";

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const WIDTH = 4;
const HEIGHT = 2;
const A: readonly Rgba[][] = [
  [
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
    { r: 128, g: 64, b: 32, a: 128 },
    { r: 0, g: 0, b: 255, a: 255 },
  ],
  [
    { r: 255, g: 255, b: 0, a: 255 },
    { r: 0, g: 255, b: 255, a: 255 },
    { r: 255, g: 0, b: 255, a: 255 },
    { r: 0, g: 0, b: 0, a: 255 },
  ],
];
const B: readonly Rgba[][] = [
  [
    { r: 11, g: 22, b: 33, a: 255 },
    { r: 11, g: 22, b: 33, a: 255 },
    { r: 11, g: 22, b: 33, a: 255 },
    { r: 11, g: 22, b: 33, a: 255 },
  ],
  [
    { r: 11, g: 22, b: 33, a: 255 },
    { r: 11, g: 22, b: 33, a: 255 },
    { r: 11, g: 22, b: 33, a: 255 },
    { r: 11, g: 22, b: 33, a: 255 },
  ],
];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  view.setUint32(8 + data.length, crc32(result.subarray(4, 8 + data.length)));
  return result;
}

function png(rows: readonly Rgba[][]): string {
  const raw = new Uint8Array(rows.length * (1 + rows[0]!.length * 4));
  let offset = 0;
  for (const row of rows) {
    raw[offset++] = 0;
    for (const pixel of row) {
      raw[offset++] = pixel.r;
      raw[offset++] = pixel.g;
      raw[offset++] = pixel.b;
      raw[offset++] = pixel.a;
    }
  }
  const header = new Uint8Array(8);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, rows[0]!.length);
  ihdrView.setUint32(4, rows.length);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    header,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offsetOut = 0;
  for (const value of parts) {
    bytes.set(value, offsetOut);
    offsetOut += value.length;
  }
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

const imageA = png(A);
const imageB = png(B);

const GLSL_SAMPLE = `#version 300 es
precision highp float;
uniform sampler2D image;
out vec4 color;
const vec2 coordinates[6] = vec2[6](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.625, 0.25),
  vec2(0.25, 0.25), vec2(0.0, 1.0), vec2(-1.0, 2.0)
);
void main() {
  vec2 uv = coordinates[int(gl_FragCoord.x)];
  color = texture(image, uv);
}`;
const GLSL_ALPHA = `#version 300 es
precision highp float;
uniform sampler2D image;
out vec4 color;
void main() {
  float alpha = texture(image, vec2(0.625, 0.25)).a;
  color = vec4(alpha, 0.0, 0.0, 1.0);
}`;
const GLSL_TWO = `#version 300 es
precision highp float;
uniform sampler2D firstImage;
uniform sampler2D secondImage;
out vec4 color;
void main() {
  vec4 first = texture(firstImage, vec2(0.625, 0.25));
  vec4 second = texture(secondImage, vec2(0.0, 0.0));
  color = vec4(first.r, second.g, first.b, second.a);
}`;

const WGSL_SAMPLE = `
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var imageSampler: sampler;
const coordinates = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.625, 0.25),
  vec2<f32>(0.25, 0.25), vec2<f32>(0.0, 1.0), vec2<f32>(-1.0, 2.0)
);
@fragment fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(image, imageSampler, coordinates[u32(position.x)]);
}`;
const WGSL_ALPHA = `
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var imageSampler: sampler;
@fragment fn main() -> @location(0) vec4<f32> {
  let alpha = textureSample(image, imageSampler, vec2<f32>(0.625, 0.25)).a;
  return vec4<f32>(alpha, 0.0, 0.0, 1.0);
}`;
const WGSL_TWO = `
@group(0) @binding(0) var firstImage: texture_2d<f32>;
@group(0) @binding(1) var firstSampler: sampler;
@group(0) @binding(2) var secondImage: texture_2d<f32>;
@group(0) @binding(3) var secondSampler: sampler;
@fragment fn main() -> @location(0) vec4<f32> {
  let first = textureSample(firstImage, firstSampler, vec2<f32>(0.625, 0.25));
  let second = textureSample(secondImage, secondSampler, vec2<f32>(0.0, 0.0));
  return vec4<f32>(first.r, second.g, first.b, second.a);
}`;

const EXPECTED_SAMPLE: readonly Rgba[] = [
  A[0]![0]!,
  A[0]![3]!,
  A[0]![2]!,
  { r: 128, g: 128, b: 0, a: 255 },
  A[1]![0]!,
  A[1]![0]!,
];

async function screenshotPixels(page: import("playwright").Page, id: string) {
  const bytes = await page.locator(`#${id}`).screenshot();
  return page.evaluate(
    async (encoded) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(encoded)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create screenshot reader.");
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      image.close();
      return [...data];
    },
    [...bytes],
  );
}

it("probes decoded sRGB/alpha/orientation, filtering, limits, and two-texture bindings", async () => {
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
        body: `
          <canvas id="gl" width="6" height="1" style="width:6px;height:1px"></canvas>
          <canvas id="gl-alpha" width="1" height="1" style="width:1px;height:1px"></canvas>
          <canvas id="gl-two" width="1" height="1" style="width:1px;height:1px"></canvas>
          <canvas id="gpu" width="6" height="6" style="width:6px;height:6px"></canvas>
          <canvas id="gpu-alpha" width="2" height="2" style="width:2px;height:2px"></canvas>
          <canvas id="gpu-two" width="2" height="2" style="width:2px;height:2px"></canvas>
        `,
      }),
    );
    await page.goto("http://localhost/");
    const result = await page.evaluate(
      async ({
        imageA,
        imageB,
        glslSample,
        glslAlpha,
        glslTwo,
        wgslSample,
        wgslAlpha,
        wgslTwo,
      }) => {
        const decode = async (url: string): Promise<ImageBitmap> => {
          const response = await fetch(url);
          const bitmap = await createImageBitmap(await response.blob(), {
            colorSpaceConversion: "none",
            premultiplyAlpha: "none",
          });
          return bitmap;
        };
        const [bitmapA, bitmapB] = await Promise.all([
          decode(imageA),
          decode(imageB),
        ]);
        const glCanvas = document.querySelector("#gl") as HTMLCanvasElement;
        const gl = glCanvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const compile = (type: number, source: string): WebGLShader => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Could not create WebGL shader");
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(shader) || "WebGL shader compilation failed",
            );
          return shader;
        };
        const program = (source: string, uniforms: readonly string[]) => {
          const vertex = compile(
            gl.VERTEX_SHADER,
            `#version 300 es
            void main() {
              vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
              gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
            }`,
          );
          const fragment = compile(gl.FRAGMENT_SHADER, source);
          const value = gl.createProgram();
          if (!value) throw new Error("Could not create WebGL program");
          gl.attachShader(value, vertex);
          gl.attachShader(value, fragment);
          gl.linkProgram(value);
          if (!gl.getProgramParameter(value, gl.LINK_STATUS))
            throw new Error(
              gl.getProgramInfoLog(value) || "WebGL program link failed",
            );
          gl.deleteShader(vertex);
          gl.deleteShader(fragment);
          return {
            value,
            locations: uniforms.map((name) =>
              gl.getUniformLocation(value, name),
            ),
          };
        };
        const texture = (bitmap: ImageBitmap, unit: number): WebGLTexture => {
          const value = gl.createTexture();
          if (!value) throw new Error("Could not create WebGL texture");
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, value);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bitmap,
          );
          if (gl.getError() !== gl.NO_ERROR)
            throw new Error("WebGL texture upload failed");
          return value;
        };
        const draw = (
          source: string,
          uniformNames: readonly string[],
          textures: readonly WebGLTexture[],
          bindings: readonly number[],
          width: number,
          height: number,
        ): number[] => {
          const shader = program(source, uniformNames);
          gl.useProgram(shader.value);
          textures.forEach((value: WebGLTexture, index: number) => {
            gl.activeTexture(gl.TEXTURE0 + index);
            gl.bindTexture(gl.TEXTURE_2D, value);
            gl.uniform1i(shader.locations[index]!, bindings[index]!);
          });
          gl.viewport(0, 0, width, height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          if (gl.getError() !== gl.NO_ERROR)
            throw new Error("WebGL readback failed");
          gl.deleteProgram(shader.value);
          return [...pixels];
        };
        const textureA = texture(bitmapA, 0);
        const textureB = texture(bitmapB, 1);
        const glSample = draw(glslSample, ["image"], [textureA], [0], 6, 1);
        const glAlpha = draw(glslAlpha, ["image"], [textureA], [0], 1, 1);
        const glTwo = draw(
          glslTwo,
          ["firstImage", "secondImage"],
          [textureA, textureB],
          [0, 1],
          1,
          1,
        );
        const glLimits = {
          maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
          maxCombinedTextureImageUnits: gl.getParameter(
            gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
          ),
          minFilter: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER),
          magFilter: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER),
          wrapS: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S),
          wrapT: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T),
        };
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        const gpuErrors: string[] = [];
        device.addEventListener("uncapturederror", (event: any) =>
          gpuErrors.push(event.error.message),
        );
        const gpuTexture = (bitmap: ImageBitmap): any => {
          const value = device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            mipLevelCount: 1,
            usage:
              (globalThis as any).GPUTextureUsage.TEXTURE_BINDING |
              (globalThis as any).GPUTextureUsage.COPY_DST |
              (globalThis as any).GPUTextureUsage.RENDER_ATTACHMENT,
          });
          device.queue.copyExternalImageToTexture(
            { source: bitmap, flipY: false },
            { texture: value, colorSpace: "srgb", premultipliedAlpha: false },
            [bitmap.width, bitmap.height],
          );
          return value;
        };
        const createPipeline = async (source: string, bindings: any[]) => {
          const module = device.createShaderModule({ code: source });
          const info = await module.getCompilationInfo();
          const errors = info.messages.filter(
            (message) => message.type === "error",
          );
          if (errors.length)
            throw new Error(
              errors.map((message) => message.message).join("\n"),
            );
          const pipeline = await device.createRenderPipelineAsync({
            layout: "auto",
            vertex: {
              module: device.createShaderModule({
                code: `@vertex
                fn main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
                  let vertices = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
                  return vec4<f32>(vertices[index], 0.0, 1.0);
                }`,
              }),
              entryPoint: "main",
            },
            fragment: {
              module,
              entryPoint: "main",
              targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
            },
            primitive: { topology: "triangle-list" },
          });
          return { pipeline, bindings };
        };
        const sampler = device.createSampler({
          minFilter: "linear",
          magFilter: "linear",
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
          addressModeW: "clamp-to-edge",
        });
        const samplerB = device.createSampler({
          minFilter: "linear",
          magFilter: "linear",
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
          addressModeW: "clamp-to-edge",
        });
        const imageTextureA = gpuTexture(bitmapA);
        const imageTextureB = gpuTexture(bitmapB);
        const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
        const render = async (
          canvasId: string,
          source: string,
          entries: any[],
        ) => {
          const canvas = document.querySelector(canvasId) as HTMLCanvasElement;
          const context = canvas.getContext("webgpu") as any;
          context.configure({
            device,
            format: preferredFormat,
            alphaMode: "opaque",
          });
          const { pipeline } = await createPipeline(source, entries);
          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries,
          });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(3);
          pass.end();
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
        };
        await render("#gpu", wgslSample, [
          { binding: 0, resource: imageTextureA.createView() },
          { binding: 1, resource: sampler },
        ]);
        await render("#gpu-alpha", wgslAlpha, [
          { binding: 0, resource: imageTextureA.createView() },
          { binding: 1, resource: sampler },
        ]);
        await render("#gpu-two", wgslTwo, [
          { binding: 0, resource: imageTextureA.createView() },
          { binding: 1, resource: sampler },
          { binding: 2, resource: imageTextureB.createView() },
          { binding: 3, resource: samplerB },
        ]);
        const gpuLimits = {
          maxSampledTexturesPerShaderStage:
            adapter.limits.maxSampledTexturesPerShaderStage,
          maxSamplersPerShaderStage: adapter.limits.maxSamplersPerShaderStage,
          maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        };
        bitmapA.close();
        bitmapB.close();
        imageTextureA.destroy();
        imageTextureB.destroy();
        return { glSample, glAlpha, glTwo, glLimits, gpuLimits, gpuErrors };
      },
      {
        imageA,
        imageB,
        glslSample: GLSL_SAMPLE,
        glslAlpha: GLSL_ALPHA,
        glslTwo: GLSL_TWO,
        wgslSample: WGSL_SAMPLE,
        wgslAlpha: WGSL_ALPHA,
        wgslTwo: WGSL_TWO,
      },
    );

    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => resolve(undefined)),
        ),
    );
    const gpuSample = await screenshotPixels(page, "gpu");
    const gpuAlpha = await screenshotPixels(page, "gpu-alpha");
    const gpuTwo = await screenshotPixels(page, "gpu-two");
    expect(result.glLimits.maxTextureImageUnits).toBeGreaterThanOrEqual(2);
    expect(result.glLimits.maxCombinedTextureImageUnits).toBeGreaterThanOrEqual(
      2,
    );
    expect(result.glLimits.minFilter).toBe(9729);
    expect(result.glLimits.magFilter).toBe(9729);
    expect(result.glLimits.wrapS).toBe(33071);
    expect(result.glLimits.wrapT).toBe(33071);
    expect(
      result.gpuLimits.maxSampledTexturesPerShaderStage,
    ).toBeGreaterThanOrEqual(2);
    expect(result.gpuLimits.maxSamplersPerShaderStage).toBeGreaterThanOrEqual(
      2,
    );
    expect(result.gpuLimits.maxTextureDimension2D).toBeGreaterThanOrEqual(4);

    for (const [index, expected] of EXPECTED_SAMPLE.entries()) {
      const glOffset = index * 4;
      expect(result.glSample.slice(glOffset, glOffset + 4)).toEqual([
        expected.r,
        expected.g,
        expected.b,
        expected.a,
      ]);
      const gpuOffset = index * 4;
      expect(gpuSample.slice(gpuOffset, gpuOffset + 3)).toEqual([
        expected.r,
        expected.g,
        expected.b,
      ]);
    }
    expect(result.glAlpha.slice(0, 3)).toEqual([128, 0, 0]);
    expect(gpuAlpha.slice(0, 3)).toEqual([128, 0, 0]);
    expect(result.glTwo.slice(0, 4)).toEqual([128, 22, 32, 255]);
    expect(gpuTwo.slice(0, 3)).toEqual([128, 22, 32]);
  } finally {
    await browser.close();
  }
}, 60_000);

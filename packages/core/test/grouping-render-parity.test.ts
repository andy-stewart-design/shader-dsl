import { chromium } from "playwright";
import { expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";

it("preserves a grouping-sensitive f32 frame against pre-change shaders in WebGL and presented WebGPU", async () => {
  const source = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ uniforms }) =>
  vec4(16777216 + (1 - 16777216), (16777216 + 1) - 16777216, 0, 1),
);`;
  const compiled = compileFragmentArtifact(source);
  expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true);
  if (!compiled.ok) return;
  const newShader = compiled.artifact;
  expect(newShader.glsl).toContain("16777216.0 + (1.0 - 16777216.0)");
  expect(newShader.wgsl).toContain("16777216.0f + (1.0f - 16777216.0f)");
  // Frozen Phase 1 output for the same IR; Phase 2 alters text, not grouping.
  const oldShader = {
    glsl: `#version 300 es\nprecision highp float;\n\nout vec4 shdr_fragment_color;\n\nvoid main() {\n  shdr_fragment_color = vec4((16777216.0 + (1.0 - 16777216.0)), ((16777216.0 + 1.0) - 16777216.0), 0.0, 1.0);\n}\n`,
    wgsl: `@fragment\nfn shdr_fragment_main() -> @location(0) vec4<f32> {\n  return vec4<f32>((16777216.0f + (1.0f - 16777216.0f)), ((16777216.0f + 1.0f) - 16777216.0f), 0.0f, 1.0f);\n}\n`,
  };
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
        body: `<!doctype html><body style="margin:0"><canvas id="gl-old" width="4" height="4"></canvas><canvas id="gl-new" width="4" height="4"></canvas><canvas id="gpu-old" width="4" height="4"></canvas><canvas id="gpu-new" width="4" height="4"></canvas></body>`,
      }),
    );
    await page.goto("http://localhost/");
    const glPixels = await page.evaluate(
      async ({ oldShader, newShader }) => {
        const glPixels = [];
        for (const [id, shader] of [
          ["gl-old", oldShader],
          ["gl-new", newShader],
        ] as const) {
          const gl = document
            .querySelector<HTMLCanvasElement>(`#${id}`)!
            .getContext("webgl2", { preserveDrawingBuffer: true })!;
          const compile = (type: number, code: string) => {
            const item = gl.createShader(type)!;
            gl.shaderSource(item, code);
            gl.compileShader(item);
            if (!gl.getShaderParameter(item, gl.COMPILE_STATUS))
              throw Error(gl.getShaderInfoLog(item) ?? "GLSL error");
            return item;
          };
          const vertex = compile(
            gl.VERTEX_SHADER,
            `#version 300 es\nvoid main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,
          );
          const fragment = compile(gl.FRAGMENT_SHADER, shader.glsl);
          const program = gl.createProgram()!;
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw Error(gl.getProgramInfoLog(program) ?? "GLSL link error");
          gl.useProgram(program);
          gl.viewport(0, 0, 4, 4);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.finish();
          const rgba = new Uint8Array(4);
          gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
          glPixels.push([...rgba]);
        }
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw Error("WebGPU unavailable");
        const device = await adapter.requestDevice();
        const vertex = device.createShaderModule({
          code: `@vertex fn main(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> { let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u)); return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f); }`,
        });
        const format = navigator.gpu.getPreferredCanvasFormat();
        for (const [id, shader] of [
          ["gpu-old", oldShader],
          ["gpu-new", newShader],
        ] as const) {
          const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`)!;
          const context = canvas.getContext("webgpu") as GPUCanvasContext;
          context.configure({ device, format, alphaMode: "opaque" });
          const module = device.createShaderModule({ code: shader.wgsl });
          const errors = (await module.getCompilationInfo()).messages.filter(
            (message) => message.type === "error",
          );
          if (errors.length)
            throw Error(errors.map((item) => item.message).join("\n"));
          const pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: vertex, entryPoint: "main" },
            fragment: {
              module,
              entryPoint: "shdr_fragment_main",
              targets: [{ format }],
            },
            primitive: { topology: "triangle-list" },
          });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.draw(3);
          pass.end();
          device.queue.submit([encoder.finish()]);
        }
        await device.queue.onSubmittedWorkDone();
        // Keep the canvases live until the outer test screenshots presented pixels.
        return glPixels;
      },
      { oldShader, newShader },
    );
    const gpuPixels = [];
    for (const id of ["gpu-old", "gpu-new"]) {
      const png = await page.locator(`#${id}`).screenshot();
      gpuPixels.push(
        await page.evaluate(
          async (bytes) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: "image/png" }),
            );
            const surface = document.createElement("canvas");
            surface.width = bitmap.width;
            surface.height = bitmap.height;
            const context = surface.getContext("2d")!;
            context.drawImage(bitmap, 0, 0);
            return [...context.getImageData(1, 1, 1, 1).data];
          },
          [...png],
        ),
      );
    }
    expect(glPixels[1]).toEqual(glPixels[0]);
    expect(gpuPixels[1]).toEqual(gpuPixels[0]);
    // The channels differ only when the right-nested f32 expression remains grouped.
    for (const pixel of [glPixels[1]!, gpuPixels[1]!]) {
      expect(pixel[0]).toBeGreaterThan(pixel[1]! + 200);
      expect(pixel[3]).toBe(255);
    }
  } finally {
    await browser.close();
  }
}, 60_000);

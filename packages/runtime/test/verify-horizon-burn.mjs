import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

const authored = await readFile(
  new URL(
    "../../../apps/vite-basic/src/references/horizon-burn.shdr.ts",
    import.meta.url,
  ),
  "utf8",
);
const original = await readFile(
  new URL(
    "../../../apps/vite-basic/src/references/horizon-burn.frag",
    import.meta.url,
  ),
  "utf8",
);
const compiled = compileFragmentArtifact(authored);
assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
const artifact = compiled.artifact;
const server = await createServer({
  root: new URL("../", import.meta.url).pathname,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string")
    throw Error("Vite server unavailable");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--enable-unsafe-webgpu",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `http://127.0.0.1:${address.port}/`;
  await page.route(url, (route) =>
    route.fulfill({
      body: '<!doctype html><canvas id="original" width="48" height="48"></canvas><canvas id="gl" width="48" height="48"></canvas><canvas id="gpu" width="48" height="48"></canvas>',
    }),
  );
  await page.goto(url);
  await page.evaluate(
    async ({ original, artifact }) => {
      const gl = document
        .querySelector("#original")
        .getContext("webgl2", { preserveDrawingBuffer: true });
      const compile = (kind, code) => {
        const shader = gl.createShader(kind);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const vertex = compile(
        gl.VERTEX_SHADER,
        `#version 300 es\nvoid main() { vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0); }`,
      );
      const fragment = compile(gl.FRAGMENT_SHADER, original);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), 48, 48);
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), 0);
      gl.viewport(0, 0, 48, 48);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      // A future clock origin pins both runtime first frames to u_time = 0.
      const startedAt = performance.now() + 60_000;
      const { createWebGlRenderer } = await import("/src/webgl.ts");
      const { createWebGpuRenderer } = await import("/src/webgpu.ts");
      window.glRenderer = await createWebGlRenderer(
        document.querySelector("#gl"),
        artifact,
        { animate: false, startedAt },
      );
      window.gpuRenderer = await createWebGpuRenderer(
        document.querySelector("#gpu"),
        artifact,
        { animate: false, startedAt },
      );
    },
    { original, artifact },
  );
  const locations = [
    [3, 3],
    [9, 21],
    [18, 38],
    [24, 24],
    [32, 12],
    [41, 44],
  ];
  const [raw, gl] = await Promise.all(
    ["original", "gl"].map((id) =>
      page.evaluate(
        ({ id, locations }) => {
          const context = document.querySelector(`#${id}`).getContext("webgl2");
          context.finish();
          return locations.map(([x, y]) => {
            const pixel = new Uint8Array(4);
            context.readPixels(
              x,
              context.drawingBufferHeight - y - 1,
              1,
              1,
              context.RGBA,
              context.UNSIGNED_BYTE,
              pixel,
            );
            return [...pixel];
          });
        },
        { id, locations },
      ),
    ),
  );
  for (let i = 0; i < locations.length; i++) {
    for (let channel = 0; channel < 4; channel++)
      assert.ok(
        Math.abs(raw[i][channel] - gl[i][channel]) <= 5,
        `GLSL reference vs generated WebGL ${locations[i]} channel ${channel}: ${raw[i]}, ${gl[i]}`,
      );
  }
  const png = await page.locator("#gpu").screenshot();
  const gpu = await page.evaluate(
    async ({ bytes, locations }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return locations.map(([x, y]) => [
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    },
    { bytes: [...png], locations },
  );
  // This is a pinned Chromium/SwiftShader frame, not a bit-exact guarantee
  // across hardware: large sin/fract products make grain precision-sensitive.
  for (let i = 0; i < locations.length; i++) {
    for (let channel = 0; channel < 4; channel++)
      assert.ok(
        Math.abs(raw[i][channel] - gpu[i][channel]) <= 7,
        `GLSL reference vs presented WebGPU ${locations[i]} channel ${channel}: ${raw[i]}, ${gpu[i]}`,
      );
  }
  assert.ok(
    gpu.some((pixel) => pixel[0] > 10 && pixel[1] > 10),
    "Presented WebGPU frame has color",
  );
  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    "Verified horizon-burn GLSL reference against generated WebGL pixels and presented WebGPU output.",
  );
} finally {
  await browser?.close();
  await server.close();
}

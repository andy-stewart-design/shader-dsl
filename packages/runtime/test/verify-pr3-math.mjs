import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

function compile(source) {
  const result = compileFragmentArtifact(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}
const vector = compile(
  await readFile(
    new URL("../../../apps/vite-basic/src/pr3-math.shdr.ts", import.meta.url),
    "utf8",
  ),
);
const scalar =
  compile(`import { createFragmentShader, sqrt, exp, tanh, clamp, pow, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const x = coord.x / uniforms.resolution.x;
  const y = coord.y / uniforms.resolution.y;
  return vec4(sqrt(x) * 0.3 + exp(-y) * 0.1, clamp(pow(y, 2), 0.1, 0.9), tanh(x) * 0.5, 1);
});`);

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
      body: '<!doctype html><canvas id="gl" width="32" height="32"></canvas><canvas id="gpu" width="32" height="32"></canvas>',
    }),
  );
  await page.goto(url);
  await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    window.glRenderer = await createWebGlRenderer(
      document.querySelector("#gl"),
      artifact,
      { animate: false },
    );
    window.gpuRenderer = await createWebGpuRenderer(
      document.querySelector("#gpu"),
      artifact,
      { animate: false },
    );
  }, vector);
  const samples = [
    [2, 4],
    [8, 13],
    [19, 23],
    [29, 30],
  ];
  await expectPixels("vector", samples, (x, y) => {
    const uv = [(x + 0.5) / 32, (y + 0.5) / 32, 0.8];
    return [
      ...uv.map((value, i) => {
        const bright = Math.sqrt(Math.min(0.9, Math.max(0.01, value ** 2)));
        return Math.round(
          255 *
            (bright * 0.3 +
              Math.exp([0.1, -0.2, 0][i]) * 0.1 +
              Math.tanh(0.5) * 0.4),
        );
      }),
      255,
    ];
  });
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, scalar);
  await expectPixels("scalar", samples, (x, y) => {
    const u = (x + 0.5) / 32;
    const v = (y + 0.5) / 32;
    return [
      Math.round(255 * (Math.sqrt(u) * 0.3 + Math.exp(-v) * 0.1)),
      Math.round(255 * Math.min(0.9, Math.max(0.1, v ** 2))),
      Math.round(255 * Math.tanh(u) * 0.5),
      255,
    ];
  });
  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    "Verified PR 3 scalar/vector math in WebGL and presented WebGPU pixels.",
  );

  async function expectPixels(label, points, reference) {
    const glPixels = await page.evaluate((positions) => {
      const gl = document.querySelector("#gl").getContext("webgl2");
      gl.finish();
      return positions.map(([x, y]) => {
        const data = new Uint8Array(4);
        gl.readPixels(
          x,
          gl.drawingBufferHeight - y - 1,
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        return [...data];
      });
    }, points);
    const png = await page.locator("#gpu").screenshot();
    const gpuPixels = await page.evaluate(
      async ({ bytes, positions }) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return positions.map(([x, y]) => [
          ...context.getImageData(x, y, 1, 1).data,
        ]);
      },
      { bytes: [...png], positions: points },
    );
    for (const [index, [x, y]] of points.entries()) {
      const expected = reference(x, y);
      for (const [backend, pixels] of [
        ["WebGL", glPixels],
        ["WebGPU", gpuPixels],
      ]) {
        for (let channel = 0; channel < 4; channel++)
          assert.ok(
            Math.abs(pixels[index][channel] - expected[channel]) <= 7,
            `${label}, ${backend} (${x},${y}) channel ${channel}: ${pixels[index]}, expected ${expected}`,
          );
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}

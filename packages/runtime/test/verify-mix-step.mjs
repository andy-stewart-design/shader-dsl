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
const cellsSource = await readFile(
  new URL(
    "../../../apps/vite-basic/src/cells-representative.shdr.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.equal(
  cellsSource,
  await readFile(
    new URL(
      "../../../apps/editor-fixture/cells-representative.shdr.ts",
      import.meta.url,
    ),
    "utf8",
  ),
);
const cells = compile(cellsSource);
const thresholds =
  compile(`import { createFragmentShader, mix, step, vec3, vec4 } from "shdr";
export default createFragmentShader(({ uniforms }) => {
  const weights = step(0.5, vec3(0.25, 0.5, 0.75));
  return vec4(mix(vec3(0.1), vec3(0.9), weights), 1);
});`);
const vectorEdges =
  compile(`import { createFragmentShader, mix, step, vec3, vec4 } from "shdr";
export default createFragmentShader(({ uniforms }) => {
  const weights = step(vec3(0.2, 0.5, 0.8), vec3(0.25, 0.5, 0.75));
  return vec4(mix(vec3(0.1), vec3(0.9), weights), 1);
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
    throw new Error("Vite server unavailable");
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
  const dimensions = await page.evaluate(async (artifact) => {
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
    return [
      document.querySelector("#gl").width,
      document.querySelector("#gpu").width,
    ];
  }, cells);
  assert.deepEqual(dimensions, [32, 32]);

  const points = [
    [2, 2],
    [4, 4],
    [8, 16],
    [19, 26],
    [24, 24],
  ];
  await expectPixels("defaults before any host update", points, (x, y) =>
    referenceCell(x, y),
  );

  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, thresholds);
  await expectPixels(
    "scalar-edge vector step: below/at/above threshold",
    [[4, 4]],
    () => [26, 230, 230, 255],
    2,
  );
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, vectorEdges);
  await expectPixels(
    "vector-edge step: per-channel threshold",
    [[4, 4]],
    () => [230, 230, 26, 255],
    2,
  );

  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
    window.glRenderer.setPointerNormalized(0.25, 0.75);
    window.gpuRenderer.setPointerNormalized(0.25, 0.75);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  }, cells);
  await expectPixels(
    "active mouse in bottom-left reconstructed coordinates",
    points,
    (x, y) => referenceCell(x, y, 8, 24),
  );

  const overrides = { dpi: 1.5, spread: 0.26, blur: 0.04 };
  await page.evaluate(async (values) => {
    window.glRenderer.setUniforms(values);
    window.gpuRenderer.setUniforms(values);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  }, overrides);
  await expectPixels("host-updated custom uniforms", points, (x, y) =>
    referenceCell(x, y, 8, 24, overrides),
  );
  await page.evaluate(async () => {
    window.glRenderer.resetUniforms();
    window.gpuRenderer.resetUniforms();
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  });
  await expectPixels("reset static defaults", points, (x, y) =>
    referenceCell(x, y, 8, 24),
  );

  // A fresh dedicated canvas exercises constructor overrides on the very
  // first frame, before any setUniforms, setPointerNormalized or manual draw.
  await page.evaluate(
    async ({ artifact, values }) => {
      window.glRenderer.dispose();
      window.gpuRenderer.dispose();
      for (const id of ["gl", "gpu"]) {
        const oldCanvas = document.querySelector(`#${id}`);
        const canvas = document.createElement("canvas");
        canvas.id = id;
        canvas.width = oldCanvas.width;
        canvas.height = oldCanvas.height;
        oldCanvas.replaceWith(canvas);
      }
      const { createWebGlRenderer } = await import("/src/webgl.ts");
      const { createWebGpuRenderer } = await import("/src/webgpu.ts");
      window.glRenderer = await createWebGlRenderer(
        document.querySelector("#gl"),
        artifact,
        { animate: false, uniforms: values },
      );
      window.gpuRenderer = await createWebGpuRenderer(
        document.querySelector("#gpu"),
        artifact,
        { animate: false, uniforms: values },
      );
    },
    { artifact: cells, values: overrides },
  );
  await expectPixels("creation overrides on first frame", points, (x, y) =>
    referenceCell(x, y, 0, 0, overrides),
  );
  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    "Verified representative cells, mix/step thresholds and custom uniforms using WebGL and presented WebGPU pixels.",
  );

  async function expectPixels(label, locations, expectedAt, tolerance = 7) {
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
    }, locations);
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
      { bytes: [...png], positions: locations },
    );
    for (const [index, [x, y]] of locations.entries()) {
      const expected = expectedAt(x, y);
      for (const [backend, pixels] of [
        ["WebGL", glPixels],
        ["WebGPU", gpuPixels],
      ]) {
        for (let channel = 0; channel < 4; channel++) {
          assert.ok(
            Math.abs(pixels[index][channel] - expected[channel]) <= tolerance,
            `${label}, ${backend} (${x},${y}) channel ${channel}: ${pixels[index]}, expected ${expected}`,
          );
        }
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}

function referenceCell(
  x,
  y,
  mouseX = 0,
  mouseY = 0,
  { dpi = 1, spread = 0.32, blur = 0.08 } = {},
) {
  const fx = x + 0.5;
  const fy = 32 - y - 0.5;
  const fract = (value) => value - Math.floor(value);
  const radius = Math.hypot(
    fract(fx / (8 * dpi)) - 0.5,
    fract(fy / (8 * dpi)) - 0.5,
  );
  const inside = radius <= spread ? 1 : 0;
  const smooth = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const feather = 1 - smooth(spread - blur, spread, radius);
  const influence =
    1 - smooth(0.1, 0.4, Math.hypot(fx - mouseX, fy - (32 - mouseY)) / 32);
  const dark = [0.06, 0.11, 0.2];
  const light = [0.55, 0.78, 0.98];
  const highlighted = [1, 0.52, 0.25];
  return [
    ...dark.map((base, index) => {
      const color = base + (light[index] - base) * feather;
      return Math.round(
        255 *
          (color + (highlighted[index] - color) * influence) *
          (0.8 + inside * 0.2),
      );
    }),
    255,
  ];
}

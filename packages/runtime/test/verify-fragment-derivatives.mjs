import assert from "node:assert/strict";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

// This is intentionally a presented-canvas test.  The Phase 0 probe established
// the encoding and a +/-4 byte tolerance on the same Chromium/SwiftShader
// targets; keep those values fixed rather than adapting them to this run.
const WIDTH = 73;
const HEIGHT = 47;
const BYTE_TOLERANCE = 4;
const SAMPLE_POINTS = [
  [11, 9],
  [36, 18],
  [61, 33],
];

const directSource = `import { createFragmentShader, dFdx, dFdy, fwidth, vec4 } from "shdr";
import { derivativeHelper } from "./derivative-helper.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => {
  return vec4(
    0.5 + 0.25 * dFdx(coord.x),
    0.5 + 0.25 * derivativeHelper(coord.y),
    0.5 + 0.25 * dFdy(uniforms.resolution.y - coord.y),
    0.5 + 0.25 * fwidth(coord.y)
  );
});`;
const helperSource = `import { defineShaderFunction, dFdy } from "shdr";
import type { Expr, F32 } from "shdr";
export const derivativeHelper = defineShaderFunction(
  (value: Expr<F32>) => dFdy(value)
);`;

const vectorDefinitions = {
  vec2: {
    expression: "vec2(0.5 * coord.x, 0.75 * coord.y)",
  },
  vec3: {
    expression:
      "vec3(0.5 * coord.x, 0.75 * coord.y, 0.75 * coord.x + 0.5 * coord.y)",
  },
  vec4: {
    expression:
      "vec4(0.5 * coord.x, 0.75 * coord.y, 0.75 * coord.x + 0.5 * coord.y, coord.x - 0.5 * coord.y)",
  },
};

function compile(entry, files = {}) {
  const result = compileFragmentArtifact({
    entry: "/work/fragment.shdr.ts",
    files: {
      "/work/fragment.shdr.ts": entry,
      ...files,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  if (!result.ok) throw new Error("unreachable");
  return result.artifact;
}

const direct = compile(directSource, {
  "/work/derivative-helper.shdr.ts": helperSource,
});
const width =
  compile(`import { createFragmentShader, fwidth, vec4 } from "shdr";
export default createFragmentShader(({ coord }) => {
  const value = fwidth(coord.y);
  return vec4(0.25 + 0.1 * value, 0.25 + 0.1 * value, 0.25 + 0.1 * value, 1);
});`);
assert.match(direct.glsl, /dFdx\(/);
assert.match(direct.glsl, /-dFdy\(/);
assert.match(direct.glsl, /shdr_internal_fn_/);
assert.match(direct.wgsl, /dpdy\(/);

function vectorSource(shape, operation, lane = undefined) {
  const { expression } = vectorDefinitions[shape];
  const value = lane === undefined ? "value" : "value.w";
  const encode = (expression) =>
    operation === "fwidth"
      ? `0.25 + 0.1 * ${expression}`
      : `0.5 + 0.25 * ${expression}`;
  const output =
    lane !== undefined
      ? `vec4(${encode(value)}, 0.5, 0.5, 1)`
      : shape === "vec2"
        ? `vec4(${encode("value.x")}, ${encode("value.y")}, 0.5, 1)`
        : shape === "vec3"
          ? `vec4(${encode("value.x")}, ${encode("value.y")}, ${encode("value.z")}, 1)`
          : `vec4(${encode("value.x")}, ${encode("value.y")}, ${encode("value.z")}, 1)`;
  return `import { createFragmentShader, ${operation}, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord }) => {
  const value = ${operation}(${expression});
  return ${output};
});`;
}

const vectorCases = [];
for (const [shape] of Object.entries(vectorDefinitions)) {
  const dx =
    shape === "vec2"
      ? [0.5, 0]
      : shape === "vec3"
        ? [0.5, 0, 0.75]
        : [0.5, 0, 0.75, 1];
  const dy =
    shape === "vec2"
      ? [0, 0.75]
      : shape === "vec3"
        ? [0, 0.75, 0.5]
        : [0, 0.75, 0.5, -0.5];
  const widths =
    shape === "vec2"
      ? [0.5, 0.75]
      : shape === "vec3"
        ? [0.5, 0.75, 1.25]
        : [0.5, 0.75, 1.25, 1.5];
  for (const [operation, slopes] of [
    ["dFdx", dx],
    ["dFdy", dy],
    ["fwidth", widths],
  ]) {
    vectorCases.push({
      artifact: compile(vectorSource(shape, operation)),
      label: `${operation} ${shape}`,
      isWidth: operation === "fwidth",
      // The presented alpha channel is opaque; Vec4's fourth lane is covered
      // by the explicit lane-w pass below.
      slopes: shape === "vec4" ? slopes.slice(0, 3) : slopes,
    });
    if (shape === "vec4")
      vectorCases.push({
        artifact: compile(vectorSource(shape, operation, 3)),
        label: `${operation} ${shape} lane w`,
        isWidth: operation === "fwidth",
        slopes: [slopes[3]],
      });
  }
}

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
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const url = `http://127.0.0.1:${address.port}/`;
  await page.route(url, (route) =>
    route.fulfill({
      body: `<!doctype html><style>html,body{margin:0;padding:0}canvas{display:block;width:${WIDTH}px;height:${HEIGHT}px}</style><canvas id="gl" width="${WIDTH}" height="${HEIGHT}"></canvas><canvas id="gpu" width="${WIDTH}" height="${HEIGHT}"></canvas>`,
    }),
  );
  await page.goto(url);

  const capabilities = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl)
      throw new Error("WebGL 2 unavailable: rendered acceptance is blocked");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const glInfo = {
      vendor: gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
      renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    };
    if (!navigator.gpu)
      throw new Error("WebGPU unavailable: rendered acceptance is blocked");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
      throw new Error("No WebGPU adapter: rendered acceptance is blocked");
    const info =
      typeof adapter.requestAdapterInfo === "function"
        ? await adapter.requestAdapterInfo()
        : adapter.info;
    return {
      gl: glInfo,
      gpu: {
        vendor: info?.vendor ?? "unknown",
        architecture: info?.architecture ?? "unknown",
        device: info?.device ?? "unknown",
        description: info?.description ?? "unknown",
      },
    };
  });
  console.log("Fragment derivative target:", JSON.stringify(capabilities));

  await page.evaluate(
    async ({ artifact }) => {
      window.backendErrors = { gl: [], gpu: [] };
      const { createWebGlRenderer } = await import("/src/webgl.ts");
      const { createWebGpuRenderer } = await import("/src/webgpu.ts");
      window.glRenderer = await createWebGlRenderer(
        document.querySelector("#gl"),
        artifact,
        {
          animate: false,
          onError: (error) => window.backendErrors.gl.push(String(error)),
        },
      );
      window.gpuRenderer = await createWebGpuRenderer(
        document.querySelector("#gpu"),
        artifact,
        {
          animate: false,
          onError: (error) => window.backendErrors.gpu.push(String(error)),
        },
      );
      const dimensions = [
        document.querySelector("#gl").width,
        document.querySelector("#gl").height,
        document.querySelector("#gpu").width,
        document.querySelector("#gpu").height,
      ];
      if (dimensions.some((value, index) => value !== [73, 47, 73, 47][index]))
        throw new Error(`Pinned canvas dimensions changed: ${dimensions}`);
      await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    },
    { artifact: direct },
  );
  await assertBackendState(page, "direct/helper signed scalar derivatives");

  await expectPixels(page, "direct/helper signed scalar derivatives", [
    [0.75, 0.75, 0.25, 1],
  ]);

  await page.evaluate(
    async ({ artifact }) => {
      const results = await Promise.all([
        window.glRenderer.setShader(artifact),
        window.gpuRenderer.setShader(artifact),
      ]);
      if (results.some((result) => result.status !== "installed"))
        throw new Error(
          `Backend did not install fwidth pass: ${JSON.stringify(results)}`,
        );
      await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    },
    { artifact: width },
  );
  await assertBackendState(page, "direct fwidth");
  await expectPixels(page, "direct fwidth", [[0.35, 0.35, 0.35, 1]]);

  for (const testCase of vectorCases) {
    await page.evaluate(
      async ({ artifact }) => {
        const results = await Promise.all([
          window.glRenderer.setShader(artifact),
          window.gpuRenderer.setShader(artifact),
        ]);
        if (results.some((result) => result.status !== "installed"))
          throw new Error(`Backend did not install ${JSON.stringify(results)}`);
        await Promise.all([
          window.glRenderer.draw(),
          window.gpuRenderer.draw(),
        ]);
      },
      { artifact: testCase.artifact },
    );
    await assertBackendState(page, testCase.label);
    const encoded = testCase.slopes.map((slope) =>
      testCase.isWidth ? 0.25 + 0.1 * slope : 0.5 + 0.25 * slope,
    );
    while (encoded.length < 3) encoded.push(0.5);
    encoded.push(1); // Canvas alpha is opaque in both renderer paths.
    await expectPixels(page, testCase.label, [encoded]);
  }

  assert.deepEqual(pageErrors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    `Verified ${vectorCases.length + 2} authored derivative passes on ${WIDTH}x${HEIGHT} presented WebGL and WebGPU canvases.`,
  );
} finally {
  await browser?.close();
  await server.close();
}

async function assertBackendState(page, label) {
  const errors = await page.evaluate(() => window.backendErrors);
  assert.deepEqual(errors, { gl: [], gpu: [] }, `${label} backend errors`);
}

async function expectPixels(page, label, slopesAtPoints) {
  const expected = slopesAtPoints[0];
  const glPixels = await page.evaluate((points) => {
    const canvas = document.querySelector("#gl");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL context disappeared");
    gl.finish();
    return points.map(([x, y]) => {
      const pixel = new Uint8Array(4);
      // WebGL readPixels is bottom-left origin; callers use screenshot/top-left
      // coordinates so this conversion is deliberate and covered by every pass.
      gl.readPixels(
        x,
        gl.drawingBufferHeight - y - 1,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      return [...pixel];
    });
  }, SAMPLE_POINTS);
  // This screenshot is the presented WebGPU canvas, not an offscreen texture or
  // a copy-buffer readback. It is decoded only to inspect stable interior pixels.
  const png = await page.locator("#gpu").screenshot();
  const gpuPixels = await page.evaluate(
    async ({ bytes, points }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    },
    { bytes: [...png], points: SAMPLE_POINTS },
  );
  const expectedBytes = expected.map((value) => Math.round(value * 255));
  const targetDifference = Math.max(
    ...glPixels.flatMap((glPixel, index) =>
      glPixel.map((value, channel) =>
        Math.abs(value - gpuPixels[index][channel]),
      ),
    ),
  );
  console.log(
    `${label} @ ${SAMPLE_POINTS[0]}: WebGL ${JSON.stringify(glPixels[0])}, WebGPU ${JSON.stringify(gpuPixels[0])}, expected ${JSON.stringify(expectedBytes)} ±${BYTE_TOLERANCE}; max target byte delta ${targetDifference}`,
  );
  for (const [backend, pixels] of [
    ["WebGL", glPixels],
    ["WebGPU", gpuPixels],
  ]) {
    for (const [index, [x, y]] of SAMPLE_POINTS.entries()) {
      for (let channel = 0; channel < 4; channel++) {
        assert.ok(
          Math.abs(pixels[index][channel] - expectedBytes[channel]) <=
            BYTE_TOLERANCE,
          `${label} ${backend} (${x},${y}) channel ${channel}: ${pixels[index]}, expected ${expectedBytes} +/- ${BYTE_TOLERANCE}`,
        );
      }
    }
  }
}

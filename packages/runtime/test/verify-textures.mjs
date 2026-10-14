import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { createServer } from "vite";
import { compileFragmentArtifact } from "@shdr/core/browser";

const root = new URL("../", import.meta.url).pathname;
const WIDTH = 4;
const HEIGHT = 2;
const IMAGE_A = [
  [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [128, 64, 32, 128],
    [0, 0, 255, 255],
  ],
  [
    [255, 255, 0, 255],
    [0, 255, 255, 255],
    [255, 0, 255, 255],
    [0, 0, 0, 255],
  ],
];
const IMAGE_B = IMAGE_A.map((row) => row.map(() => [11, 22, 33, 255]));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  view.setUint32(8 + data.length, crc32(result.subarray(4, 8 + data.length)));
  return result;
}
function png(rows) {
  const raw = new Uint8Array(rows.length * (1 + rows[0].length * 4));
  let offset = 0;
  for (const row of rows) {
    raw[offset++] = 0;
    for (const pixel of row) for (const value of pixel) raw[offset++] = value;
  }
  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, rows[0].length);
  view.setUint32(4, rows.length);
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
  for (const part of parts) {
    bytes.set(part, offsetOut);
    offsetOut += part.length;
  }
  return Buffer.from(bytes);
}

function compile(source) {
  const result = compileFragmentArtifact(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}
function oneTexture(url, expression) {
  return compile(`import { defineUniforms, sample, vec2, vec4 } from "shdr";
export default defineUniforms((u) => ({ photo: u.texture2D(${JSON.stringify(url)}) }))
  .createFragmentShader(({ uniforms }) => ${expression});`);
}
function gainTexture(url) {
  return compile(`import { defineUniforms, sample, vec2 } from "shdr";
export default defineUniforms((u) => ({ photo: u.texture2D(${JSON.stringify(url)}), gain: u.f32(1) }))
  .createFragmentShader(({ uniforms }) => sample(uniforms.photo, vec2(0, 0)) * uniforms.gain);`);
}
function twoTextures(first, second) {
  return compile(`import { defineUniforms, sample, vec2, vec4 } from "shdr";
export default defineUniforms((u) => ({
  first: u.texture2D(${JSON.stringify(first)}),
  second: u.texture2D(${JSON.stringify(second)}),
})).createFragmentShader(({ uniforms }) => {
  const a = sample(uniforms.first, vec2(0, 0));
  const b = sample(uniforms.second, vec2(0, 0));
  return vec4(a.r, b.g, a.b, b.a);
});`);
}

const topLeft = oneTexture("/photo.png", "sample(uniforms.photo, vec2(0, 0))");
const fractional = oneTexture(
  "/photo.png",
  "sample(uniforms.photo, vec2(0.625, 0.25))",
);
const clamped = oneTexture("/photo.png", "sample(uniforms.photo, vec2(-1, 2))");
const alpha = oneTexture(
  "/photo.png",
  "vec4(sample(uniforms.photo, vec2(0.625, 0.25)).a, 0, 0, 1)",
);
const gain = gainTexture("/photo.png");
const second = oneTexture("/second.png", "sample(uniforms.photo, vec2(0, 0))");
const two = twoTextures("/photo.png", "/second.png");
const missing = oneTexture(
  "/missing.png",
  "sample(uniforms.photo, vec2(0, 0))",
);
const corrupt = oneTexture(
  "/corrupt.png",
  "sample(uniforms.photo, vec2(0, 0))",
);
const cors = oneTexture(
  "https://texture.invalid/cors.png",
  "sample(uniforms.photo, vec2(0, 0))",
);
const slow = oneTexture("/slow.png", "sample(uniforms.photo, vec2(0, 0))");

async function screenshotPixel(page) {
  const bytes = await page.locator("#canvas").screenshot();
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
      const pixel = [...context.getImageData(0, 0, 1, 1).data];
      image.close();
      return pixel;
    },
    [...bytes],
  );
}
function expectPixel(actual, expected, label, tolerance = 2) {
  assert.equal(actual.length, 4, label);
  for (let index = 0; index < 4; index++)
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `${label}: channel ${index}: expected ${expected[index]}, got ${actual[index]}`,
    );
}
async function readbackPixel(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL 2 unavailable for readback.");
    gl.finish();
    const pixel = new Uint8Array(4);
    gl.readPixels(0, canvas.height - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error("WebGL readback failed.");
    return [...pixel];
  });
}
async function expectRendered(page, expected, label, tolerance = 2) {
  expectPixel(
    await screenshotPixel(page),
    expected,
    `${label} presented`,
    tolerance,
  );
  expectPixel(
    await readbackPixel(page),
    expected,
    `${label} readPixels`,
    tolerance,
  );
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("Server unavailable");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage();
  let photoFetches = 0;
  await page.route("**/photo.png", (route) => {
    photoFetches++;
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      body: png(IMAGE_A),
    });
  });
  await page.route("**/second.png", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: png(IMAGE_B),
    }),
  );
  await page.route("**/corrupt.png", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: "not an image",
    }),
  );
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<canvas id="canvas" width="4" height="2" style="width:4px;height:2px"></canvas>',
    }),
  );
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const initial = await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    window.createWebGlRendererForTextureTest = createWebGlRenderer;
    const canvas = document.querySelector("#canvas");
    window.renderer = await createWebGlRenderer(canvas, artifact, {
      animate: false,
    });
    return true;
  }, topLeft);
  assert.equal(initial, true);
  await expectRendered(page, [255, 0, 0, 255], "top-left");

  await page.evaluate(
    (artifact) => window.renderer.setShader(artifact),
    fractional,
  );
  await expectRendered(page, [128, 64, 32, 255], "fractional", 3);
  await page.evaluate(
    (artifact) => window.renderer.setShader(artifact),
    clamped,
  );
  await expectRendered(page, [255, 255, 0, 255], "clamped");
  await page.evaluate((artifact) => window.renderer.setShader(artifact), alpha);
  await expectRendered(page, [128, 0, 0, 255], "straight alpha", 3);

  const beforeUniformFetches = photoFetches;
  await page.evaluate((artifact) => window.renderer.setShader(artifact), gain);
  await page.evaluate(() => {
    window.renderer.setUniforms({ gain: 0.5 });
    return window.renderer.draw();
  });
  await expectRendered(page, [128, 0, 0, 255], "numeric update", 3);
  assert.equal(photoFetches, beforeUniformFetches + 1);

  await page.evaluate((artifact) => window.renderer.setShader(artifact), two);
  await expectRendered(page, [255, 22, 0, 255], "two textures");

  const beforeFailure = await screenshotPixel(page);
  const missingResult = await page.evaluate(async (artifact) => {
    try {
      await window.renderer.setShader(artifact);
      return { ok: true };
    } catch (error) {
      return { ok: false, kind: error.kind, message: error.message };
    }
  }, missing);
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.kind, "resource");
  assert.match(missingResult.message, /fetch/);
  expectPixel(
    await screenshotPixel(page),
    beforeFailure,
    "failed replacement",
    0,
  );

  const corruptResult = await page.evaluate(async (artifact) => {
    try {
      await window.renderer.setShader(artifact);
      return { ok: true };
    } catch (error) {
      return { ok: false, kind: error.kind, message: error.message };
    }
  }, corrupt);
  assert.equal(corruptResult.ok, false);
  assert.equal(corruptResult.kind, "resource");
  assert.match(corruptResult.message, /decode/);
  expectPixel(
    await screenshotPixel(page),
    beforeFailure,
    "failed decode replacement",
    0,
  );

  const corsResult = await page.evaluate(async (artifact) => {
    try {
      await window.renderer.setShader(artifact);
      return { ok: true };
    } catch (error) {
      return { ok: false, kind: error.kind, message: error.message };
    }
  }, cors);
  assert.equal(corsResult.ok, false);
  assert.equal(corsResult.kind, "resource");
  assert.match(corsResult.message, /fetch/);
  expectPixel(
    await screenshotPixel(page),
    beforeFailure,
    "failed CORS replacement",
    0,
  );

  let releaseSlow;
  let slowRequestedResolve;
  const slowRequested = new Promise((resolve) => {
    slowRequestedResolve = resolve;
  });
  await page.route("**/slow.png", async (route) => {
    slowRequestedResolve();
    await new Promise((resolve) => {
      releaseSlow = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: png(IMAGE_A),
    });
  });
  const stale = page.evaluate(
    (artifact) => window.renderer.setShader(artifact),
    slow,
  );
  await slowRequested;
  const latest = await page.evaluate(
    (artifact) => window.renderer.setShader(artifact),
    second,
  );
  releaseSlow();
  const staleResult = await stale;
  assert.deepEqual(staleResult, { status: "superseded" });
  assert.deepEqual(await latest, {
    status: "installed",
    boundUniforms: [],
    warnings: [],
  });
  await expectRendered(page, [11, 22, 33, 255], "superseding replacement");

  const disposed = page.evaluate(
    (artifact) => window.renderer.setShader(artifact),
    slow,
  );
  await slowRequested;
  await page.evaluate(() => window.renderer.dispose());
  releaseSlow();
  assert.deepEqual(await disposed, { status: "superseded" });

  const lossSupported = await page.evaluate(async (artifact) => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 2;
    document.body.append(canvas);
    window.textureErrors = [];
    window.lossRenderer = await window.createWebGlRendererForTextureTest(
      canvas,
      artifact,
      { animate: false, onError: (error) => window.textureErrors.push(error) },
    );
    const gl = canvas.getContext("webgl2");
    return Boolean(gl?.getExtension("WEBGL_lose_context"));
  }, second);
  assert.equal(lossSupported, true);
  await page.evaluate(() => {
    const canvas = document.body.lastElementChild;
    canvas
      .getContext("webgl2")
      .getExtension("WEBGL_lose_context")
      .loseContext();
  });
  await page.waitForFunction(() =>
    window.textureErrors.some((error) => error.kind === "lost"),
  );
  console.log(
    "Verified WebGL texture upload, UV/filter/clamp/alpha pixels, numeric isolation, failed replacement, supersession, disposal and context loss.",
  );
} finally {
  await browser?.close();
  await server.close();
}

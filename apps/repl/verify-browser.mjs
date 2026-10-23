import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const texturePng = makePng([
  [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
  ],
]);
const server = await createServer({
  root,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite did not expose a TCP development-server address.");
  }

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
  const browserErrors = [];
  const corsErrors = [];
  const textureRequests = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://repl-texture.test/"))
      textureRequests.push(request.url());
    assert.ok(
      !request.url().endsWith(".shdr.ts"),
      `REPL requested authored shader module: ${request.url()}`,
    );
  });
  await page.route("https://repl-texture.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/ok.png") {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: texturePng,
      });
      return;
    }
    if (pathname === "/denied.png") {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "https://wrong.test" },
        body: texturePng,
      });
      return;
    }
    if (pathname === "/missing.png") {
      await route.fulfill({ status: 404, body: "missing" });
      return;
    }
    await route.abort();
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (
      message.text().includes("repl-texture.test/denied.png") ||
      message.text().includes("repl-texture.test/missing.png") ||
      message.text().includes("CORS policy") ||
      message.text().includes("ERR_FAILED") ||
      message.text().includes("status of 404")
    )
      corsErrors.push(message.text());
    else browserErrors.push(message.text());
  });

  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "load" });
  await waitForValidation(page, "glsl-es-300", "success");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-validation-target="wgsl"]')
        ?.getAttribute("data-validation-state") !== "pending",
  );

  const canvas = page.locator('[data-render-target="glsl-es-300"]');
  const diagnostics = page.getByRole("region", { name: "Diagnostics" });
  assert.match(
    await diagnostics.textContent(),
    /Compilation time: \d+\.\d{2} ms/,
  );
  const glslValidation = page.locator('[data-validation-target="glsl-es-300"]');
  assert.match(
    await glslValidation.textContent(),
    /compiled, linked, and rendered/i,
  );
  await assertBindings(page, "glsl-es-300", "resolution");

  const wgslValidation = page.locator('[data-validation-target="wgsl"]');
  const wgslState = await wgslValidation.getAttribute("data-validation-state");
  // This context explicitly enables SwiftShader WebGPU. Availability is a
  // requirement here; separate contexts below prove the unavailable paths.
  assert.equal(
    wgslState,
    "success",
    `WebGPU did not render: ${await wgslValidation.textContent()}`,
  );
  assert.match(await wgslValidation.textContent(), /rendered in WebGPU/i);
  const gpuCanvas = page.locator('[data-render-target="wgsl"]');
  await assertBindings(page, "wgsl", "resolution");

  const initial = await readGradientSamples(page);
  assertChannel("center red", initial.center[0], 128, 3);
  assertChannel("center green", initial.center[1], 128, 3);
  assertChannel("top green", initial.top[1], 0, 3);
  assertChannel("bottom green", initial.bottom[1], 255, 3);
  assertChannel("initial blue", initial.center[2], 0, 1);
  assertChannel("initial alpha", initial.center[3], 255, 1);
  await assertPixelParity(
    page,
    "gradient",
    [
      [0.03, 0.03],
      [0.5, 0.5],
      [0.97, 0.03],
      [0.03, 0.97],
      [0.97, 0.97],
    ],
    5,
  );

  const initialWidth = initial.width;
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForFunction((previousWidth) => {
    const target = document.querySelector('[data-render-target="glsl-es-300"]');
    if (!(target instanceof HTMLCanvasElement)) return false;
    return target.width !== previousWidth;
  }, initialWidth);
  const resized = await readCanvasMetrics(page);
  assert.equal(
    resized.width,
    Math.round(resized.cssWidth * resized.pixelRatio),
  );
  assert.equal(
    resized.height,
    Math.round(resized.cssHeight * resized.pixelRatio),
  );

  const glslTab = page.getByRole("tab", { name: "GLSL ES 3.00" });
  const wgslTab = page.getByRole("tab", { name: "WGSL" });
  assert.equal(await glslTab.getAttribute("aria-selected"), "true");
  const glslOutput = await page.getByRole("tabpanel").textContent();
  assert.match(glslOutput, /shdr_internal_fn_0/);
  assert.match(glslOutput, /u_resolution\.y - gl_FragCoord\.y/);
  await wgslTab.click();
  assert.equal(await wgslTab.getAttribute("aria-selected"), "true");
  const wgslOutput = await page.getByRole("tabpanel").textContent();
  assert.match(wgslOutput, /fn shdr_internal_fn_0/);
  assert.match(wgslOutput, /@builtin\(position\) shdr_coord/);
  assert.match(wgslOutput, /shdr_coord\.xy/);
  assert.doesNotMatch(wgslOutput, /resolution\.y -/);
  await glslTab.click();

  const editor = page.getByRole("textbox", { name: "Shader source editor" });
  const originalSource = await editor.inputValue();
  const expandedSource = await readFile(
    new URL(
      "../../packages/core/test/fixtures/expanded.shdr.ts",
      import.meta.url,
    ),
    "utf8",
  );
  await compileSource(page, editor, expandedSource);
  await waitForValidation(page, "glsl-es-300", "success");
  const expandedPixel = await readCenterPixel(page);
  assertChannel("expanded red", expandedPixel[0], 128, 4);
  assertChannel("expanded green", expandedPixel[1], 64, 4);
  assertChannel("expanded blue", expandedPixel[2], 64, 4);
  await waitForValidation(page, "wgsl", "success");
  await assertPixelParity(
    page,
    "expanded",
    [
      [0.5, 0.5],
      [0.25, 0.75],
    ],
    5,
  );
  const mathSource = await readFile(
    new URL("../vite-basic/src/math-builtins.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, mathSource);
  await waitForValidation(page, "glsl-es-300", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  const mathPixel = await readCenterPixel(page);
  assertChannel("math red", mathPixel[0], 91, 6);
  assertChannel("math green", mathPixel[1], 112, 6);
  assertChannel("math blue", mathPixel[2], 106, 6);
  await waitForValidation(page, "wgsl", "success");
  // Finite, increasing-edge smoothstep and nonzero normalize inputs only.
  // Do not assert bit identity or reversed-edge portability.
  await assertPixelParity(
    page,
    "math builtins",
    [
      [0.5, 0.5],
      [0.25, 0.75],
    ],
    8,
  );
  const validMathGpuPixel = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  await wgslTab.click();
  assert.match(
    await page.getByRole("tabpanel").textContent(),
    /fn shdr_internal_smoothstep_vec2/,
  );
  await glslTab.click();
  const mixedShapeSource = `import { clamp, createFragmentShader, pow, sin, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  // Keep every dynamic clamp bound ordered and every pow base positive.
  const s = sin(uniforms.time * 0.25) * 0.1 + 0.75;
  const low2 = vec2(0.1 + uv.x * 0.1, 0.2 + uv.y * 0.1);
  const high2 = vec2(s + 0.4 + uv.x * 0.1, s + 0.5 + uv.y * 0.1);
  const low3 = vec3(low2, 0.3);
  const high3 = vec3(high2, s + 0.6);
  const low4 = vec4(low3, 0.4);
  const high4 = vec4(high3, s + 0.7);
  const a = clamp(high2, s, s);
  const b = clamp(high2, s, high2);
  const c = clamp(low2, low2, s);
  const d = pow(low2, s);
  const e = clamp(high3, s, s);
  const f = clamp(high3, s, high3);
  const g = clamp(low3, low3, s);
  const h = pow(low3, s);
  const i = clamp(high4, s, s);
  const j = clamp(high4, s, high4);
  const k = clamp(low4, low4, s);
  const l = pow(low4, s);
  return vec4(a.x + b.x + c.x + d.x, e.x + f.x + g.x + h.x, i.x + j.x + k.x + l.x, 1);
});`;
  await compileSource(page, editor, mixedShapeSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  await compileSource(page, editor, mathSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  const orbitSource = `import { acos, asin, atan, createFragmentShader, defineShaderFunction, degrees, fract, mod, radians, vec2, vec3, vec4 } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
const angle = defineShaderFunction((y: Expr<Vec2<F32>>, x: Expr<Vec2<F32>>) => atan(y, x));
export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const v2 = uv;
  const v3 = vec3(v2, 0);
  const v4 = vec4(v3, 1);
  const s = v2.x;
  const axis = vec2(1);
  const binary = angle(v2, axis);
  const unary = atan(v2);
  const inverse = asin(v2) + acos(v2);
  const converted = degrees(radians(v3));
  const wrapped = mod(v4, -1.5);
  return vec4(
    0.5 + inverse.x * 0.1 + binary.x * 0.05 + unary.x * 0.05,
    converted.x * 0.01,
    fract(0.5 + wrapped.x * 0.1 + degrees(radians(s)) * 0.01),
    1,
  );
});`;
  await compileSource(page, editor, orbitSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  const orbitGlPixel = await readCenterPixel(page);
  const orbitGpuPixel = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  const invalidOrbitSource = orbitSource.replace(
    "angle(v2, axis)",
    "atan(v2, s)",
  );
  await compileSource(page, editor, invalidOrbitSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1208/);
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );
  assert.deepEqual(await readCenterPixel(page), orbitGlPixel);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    orbitGpuPixel,
  );
  await compileSource(page, editor, mathSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");

  const matrixSource = `import { createFragmentShader, defineShaderFunction, mat2, vec2, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
const diagonal = defineShaderFunction((value: Expr<F32>) => mat2(value));
export default createFragmentShader(() => {
  const matrix = diagonal(1);
  const transformed = matrix * vec2(0.25, 0.75);
  return vec4(transformed, 0, 1);
});`;
  await compileSource(page, editor, matrixSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  await assertBindings(page, "glsl-es-300", "");
  await assertBindings(page, "wgsl", "");
  const matrixGlPixel = (await readWebGlPixels(page, [[0.5, 0.5]]))[0];
  const matrixGpuPixel = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  assertChannel("matrix WebGL red", matrixGlPixel[0], 64, 3);
  assertChannel("matrix WebGL green", matrixGlPixel[1], 191, 3);
  assertChannel("matrix WebGPU red", matrixGpuPixel[0], 64, 3);
  assertChannel("matrix WebGPU green", matrixGpuPixel[1], 191, 3);
  const invalidMatrixSource = matrixSource.replace(
    "matrix * vec2(0.25, 0.75)",
    "mat2(1) / 2",
  );
  await compileSource(page, editor, invalidMatrixSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1205/);
  assert.deepEqual(
    (await readWebGlPixels(page, [[0.5, 0.5]]))[0],
    matrixGlPixel,
  );
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    matrixGpuPixel,
  );
  await compileSource(page, editor, matrixSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  await compileSource(page, editor, mathSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");

  const invalidMathSource = await readFile(
    new URL(
      "../editor-fixture/test/fixtures/invalid-math.shdr.ts",
      import.meta.url,
    ),
    "utf8",
  );
  await compileSource(page, editor, invalidMathSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1209/);
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );
  assert.deepEqual(await readCenterPixel(page), mathPixel);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    validMathGpuPixel,
  );
  const pr3Source = await readFile(
    new URL("../vite-basic/src/pr3-math.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, pr3Source);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  await assertPixelParity(
    page,
    "PR 3 math",
    [
      [0.5, 0.5],
      [0.25, 0.75],
    ],
    9,
  );
  const pr3Pixel = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  await compileSource(page, editor, pr3Source.replace("vec3(0.01)", "vec3(1)"));
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1209/);
  assert.deepEqual((await readWebGpuPixels(page, [[0.5, 0.5]]))[0], pr3Pixel);
  const readableSource = await readFile(
    new URL("../vite-basic/src/readable-output.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, readableSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  assert.match(
    await page.getByRole("tabpanel").textContent(),
    /vec2 inputMouse = vec2\(u_mouse\.x, u_resolution\.y - u_mouse\.y\)/,
  );
  await wgslTab.click();
  assert.match(
    await page.getByRole("tabpanel").textContent(),
    /let inputMouse: vec2<f32>/,
  );
  assert.match(
    await page.getByRole("tabpanel").textContent(),
    /a \+ \(b \+ shdr_local_3 \* 0\.1f\)/,
  );
  await glslTab.click();
  await assertPixelParity(
    page,
    "readable output",
    [
      [0.25, 0.75],
      [0.5, 0.5],
    ],
    7,
  );
  const plasmaSource = await readFile(
    new URL("../shdr-gallery/src/shaders/plasma.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, plasmaSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  for (const sample of [
    (await readWebGlPixels(page, [[0.5, 0.5]]))[0],
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
  ]) {
    assert.equal(sample[3], 255);
    assert.ok(sample.slice(0, 3).some((channel) => channel > 0));
  }
  // Grain's large sin/fract arguments are precision-sensitive; the isolated
  // runtime test pins host values and checks reference WebGL + presented GPU.
  const horizonSource = await readFile(
    new URL(
      "../shdr-gallery/src/shaders/horizon-burn.shdr.ts",
      import.meta.url,
    ),
    "utf8",
  );
  await compileSource(page, editor, horizonSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  for (const sample of [
    (await readWebGlPixels(page, [[0.5, 0.5]]))[0],
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
  ]) {
    assert.equal(sample[3], 255);
    assert.ok(sample.slice(0, 3).some((channel) => channel > 0));
  }
  // Grain uses large sin/fract products, and the REPL's CSS border can shift
  // screenshot samples: compare corresponding pixels on borderless canvases
  // against the original GLSL in verify-horizon-burn.mjs instead.
  const cellsSource = await readFile(
    new URL("../vite-basic/src/cells-representative.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, cellsSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  // REPL canvas screenshots include a CSS border, so near sharp cell/step
  // edges their sample can be an adjacent pixel to WebGL readPixels. The
  // borderless runtime pixel suite checks exact corresponding port samples.
  const [cellsGlPixel] = await readWebGlPixels(page, [[0.5, 0.5]]);
  const [cellsGpuPixel] = await readWebGpuPixels(page, [[0.5, 0.5]]);
  for (const [backend, sample] of [
    ["WebGL", cellsGlPixel],
    ["WebGPU", cellsGpuPixel],
  ]) {
    assert.equal(sample[3], 255, `${backend} cells output is opaque`);
    assert.ok(
      sample.slice(0, 3).some((channel) => channel > 0),
      `${backend} cells rendered`,
    );
  }
  const invalidCellsSource = cellsSource.replace(
    "mix(cellColor, vec3(1, 0.52, 0.25), influence)",
    "mix(cellColor, vec3(1, 0.52, 0.25), frag)",
  );
  await compileSource(page, editor, invalidCellsSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1208/);
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );
  assert.deepEqual(
    (await readWebGlPixels(page, [[0.5, 0.5]]))[0],
    cellsGlPixel,
  );
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    cellsGpuPixel,
  );
  const geometrySource = await readFile(
    new URL("../editor-fixture/geometry-math.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, geometrySource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  const geometryPixel = await readCenterPixel(page);
  assertChannel("geometry green", geometryPixel[1], 255, 1);
  assertChannel("geometry alpha", geometryPixel[3], 255, 1);
  // Geometry fixture has a time-dependent alpha; compare only its constant
  // green channel instead of promising a portable ceil(time) sample.
  assertChannel(
    "geometry WebGPU green",
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0][1],
    255,
    1,
  );
  await compileSource(page, editor, originalSource);
  await waitForValidation(page, "glsl-es-300", "success");

  const textureSource = (
    url,
  ) => `import { defineUniforms, sample, vec2 } from "shdr";
export default defineUniforms((u) => ({ photo: u.texture2D(${JSON.stringify(url)}) }))
  .createFragmentShader(({ uniforms }) =>
    sample(uniforms.photo, vec2(0, 0)),
  );
`;
  const initialTextureRequestCount = textureRequests.length;
  await compileSource(
    page,
    editor,
    textureSource("https://repl-texture.test/ok.png"),
  );
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.equal(
    textureRequests.length - initialTextureRequestCount,
    2,
    "Both previews must load the accepted HTTPS texture independently.",
  );
  for (const [backend, pixel] of [
    ["WebGL", (await readWebGlPixels(page, [[0.5, 0.5]]))[0]],
    ["WebGPU", (await readWebGpuPixels(page, [[0.5, 0.5]]))[0]],
  ]) {
    assertChannel(`${backend} texture red`, pixel[0], 255, 3);
    assertChannel(`${backend} texture green`, pixel[1], 0, 3);
    assertChannel(`${backend} texture blue`, pixel[2], 0, 3);
    assertChannel(`${backend} texture alpha`, pixel[3], 255, 1);
  }
  const texturePixels = await readWebGlPixels(page, [[0.5, 0.5]]);
  const gpuTexturePixels = await readWebGpuPixels(page, [[0.5, 0.5]]);
  await compileSource(
    page,
    editor,
    textureSource("https://repl-texture.test/denied.png"),
  );
  await waitForValidation(page, "glsl-es-300", "error");
  await waitForValidation(page, "wgsl", "error");
  assert.match(
    await page
      .locator('[data-validation-target="glsl-es-300"] .render-message')
      .textContent(),
    /Texture (fetch|resource) failed/i,
  );
  assert.deepEqual(
    await readWebGlPixels(page, [[0.5, 0.5]]),
    texturePixels,
    "A denied texture must preserve the last successful WebGL frame.",
  );
  assert.deepEqual(
    await readWebGpuPixels(page, [[0.5, 0.5]]),
    gpuTexturePixels,
    "A denied texture must preserve the last successful WebGPU frame.",
  );
  await compileSource(
    page,
    editor,
    textureSource("https://repl-texture.test/missing.png"),
  );
  await waitForValidation(page, "glsl-es-300", "error");
  await waitForValidation(page, "wgsl", "error");
  assert.match(
    await page
      .locator('[data-validation-target="glsl-es-300"] .render-message')
      .textContent(),
    /Texture fetch failed/i,
  );
  assert.deepEqual(
    await readWebGlPixels(page, [[0.5, 0.5]]),
    texturePixels,
    "A missing texture must preserve the last successful WebGL frame.",
  );

  const rootTextureRequestCount = textureRequests.length;
  await compileSource(page, editor, textureSource("/local.png"));
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(
    await diagnostics.textContent(),
    /REPL texture URL policy error/i,
  );
  assert.equal(
    textureRequests.length,
    rootTextureRequestCount,
    "Root-relative REPL texture URLs must be rejected before fetch.",
  );
  for (const forbidden of [
    textureSource("http://repl-texture.test/insecure.png"),
    textureSource("//repl-texture.test/protocol-relative.png"),
  ]) {
    const requestCount = textureRequests.length;
    await compileSource(page, editor, forbidden);
    await waitForValidation(page, "glsl-es-300", "blocked");
    await waitForValidation(page, "wgsl", "blocked");
    assert.match(await diagnostics.textContent(), /SHDR1210/);
    assert.equal(
      textureRequests.length,
      requestCount,
      "Unsupported REPL texture URLs must be rejected before fetch.",
    );
  }
  const dynamicTextureSource = `import { defineUniforms, sample, vec2 } from "shdr";
const url = "https://repl-texture.test/dynamic.png";
export default defineUniforms((u) => ({ photo: u.texture2D(url) }))
  .createFragmentShader(({ uniforms }) =>
    sample(uniforms.photo, vec2(0, 0)),
  );`;
  const dynamicRequestCount = textureRequests.length;
  await compileSource(page, editor, dynamicTextureSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /literal URL|literal/i);
  assert.equal(
    textureRequests.length,
    dynamicRequestCount,
    "Dynamic REPL texture URLs must be rejected before fetch.",
  );

  const implicitResolutionSource = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const color = vec4(coord.x / 100, coord.y / 100, 0, 1);

  return color;
});
`;
  await compileSource(page, editor, implicitResolutionSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await assertBindings(page, "glsl-es-300", "resolution");
  assert.match(
    await page.getByRole("tabpanel").textContent(),
    /uniform vec2 u_resolution/,
  );
  await wgslTab.click();
  assert.doesNotMatch(
    await page.getByRole("tabpanel").textContent(),
    /shdr_resolution/,
  );
  await glslTab.click();
  await assertBindings(page, "wgsl", "");
  await assertPixelParity(
    page,
    "implicit GLSL resolution only",
    [[0.25, 0.5]],
    5,
  );
  const constantSource = shaderColor("vec4(0.25, 0.5, 0.75, 1)");
  await compileSource(page, editor, constantSource);
  await assertBindings(page, "glsl-es-300", "");
  await assertBindings(page, "wgsl", "");
  await assertPixelParity(
    page,
    "no bindings",
    [
      [0.25, 0.25],
      [0.75, 0.75],
    ],
    2,
  );
  for (const pixel of await readWebGpuPixels(page, [
    [0.25, 0.25],
    [0.75, 0.75],
  ])) {
    for (const [index, value] of [64, 128, 191, 255].entries()) {
      assertChannel(`constant channel ${index}`, pixel[index], value, 2);
    }
  }

  const moduleConstantsSource = `import { createFragmentShader, defineShaderFunction, vec2, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
const SCALE = 0.5;
const CENTER = vec2(0.5, 0.25);
const scale = defineShaderFunction((value: Expr<F32>) => value * SCALE);
export default createFragmentShader(() => vec4(scale(0.25), CENTER.x, CENTER.y, 1));
`;
  await compileSource(page, editor, moduleConstantsSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  await assertBindings(page, "glsl-es-300", "");
  await assertBindings(page, "wgsl", "");
  const moduleConstantsGlPixel = await readCenterPixel(page);
  assertChannel("module constant WebGL red", moduleConstantsGlPixel[0], 32, 3);
  assertChannel(
    "module constant WebGL green",
    moduleConstantsGlPixel[1],
    128,
    3,
  );
  assertChannel("module constant WebGL blue", moduleConstantsGlPixel[2], 64, 3);
  const moduleConstantsGpuPixel = (
    await readWebGpuPixels(page, [[0.5, 0.5]])
  )[0];
  assertChannel(
    "module constant WebGPU red",
    moduleConstantsGpuPixel[0],
    32,
    3,
  );
  assertChannel(
    "module constant WebGPU green",
    moduleConstantsGpuPixel[1],
    128,
    3,
  );
  assertChannel(
    "module constant WebGPU blue",
    moduleConstantsGpuPixel[2],
    64,
    3,
  );
  await assertPixelParity(
    page,
    "module constants",
    [
      [0.5, 0.5],
      [0.25, 0.75],
    ],
    3,
  );

  const importedConstantSource = `import { createFragmentShader, vec4 } from "shdr";
import { VALUE } from "./constants.shdr.ts";
export default createFragmentShader(() => vec4(VALUE, 0, 0, 1));
`;
  await compileSource(page, editor, importedConstantSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1108|SHDR1300/);
  assert.deepEqual(await readCenterPixel(page), moduleConstantsGlPixel);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    moduleConstantsGpuPixel,
  );

  const invalidModuleConstantsSource = moduleConstantsSource.replace(
    "const SCALE = 0.5;",
    "const SCALE = 0.5 + 0.1;",
  );
  await compileSource(page, editor, invalidModuleConstantsSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1105/);
  assert.deepEqual(await readCenterPixel(page), moduleConstantsGlPixel);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    moduleConstantsGpuPixel,
  );
  await compileSource(page, editor, moduleConstantsSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");

  for (const [name, callback, samples] of [
    ["no context", "() => vec4(0.25, 0.5, 0.75, 1)", [[0.25, 0.25]]],
    [
      "coord only",
      "({ coord }) => vec4(coord.x / 100, coord.y / 100, 0, 1)",
      [[0.25, 0.75]],
    ],
    [
      "uniforms only",
      "({ uniforms }) => vec4(uniforms.resolution.x / uniforms.resolution.x, 0, 0, 1)",
      [[0.5, 0.5]],
    ],
    [
      "reordered context",
      "({ uniforms, coord }) => vec4(coord.x / uniforms.resolution.x, coord.y / uniforms.resolution.y, 0, 1)",
      [[0.25, 0.75]],
    ],
  ]) {
    await compileSource(
      page,
      editor,
      `import { createFragmentShader, vec4 } from "shdr";\nexport default createFragmentShader(${callback});`,
    );
    await waitForValidation(page, "glsl-es-300", "success");
    await waitForValidation(page, "wgsl", "success");
    await assertPixelParity(page, `${name} fragment callback`, samples, 5);
  }

  await compileSource(
    page,
    editor,
    originalSource.replace(
      "vec4(uv.x, uv.y, 0, 1)",
      "vec4(uv.x, uv.y, 0.75, 1)",
    ),
  );
  await waitForValidation(page, "glsl-es-300", "success");
  const editedPixel = await readCenterPixel(page);
  assertChannel("edited blue", editedPixel[2], 191, 3);
  assertChannel("edited alpha", editedPixel[3], 255, 1);
  await waitForValidation(page, "wgsl", "success");
  const editedGpuPixel = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];

  await compileSource(
    page,
    editor,
    originalSource.replace("uniforms.resolution", "uniforms.missing"),
  );
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1203/);
  assert.match(
    await glslValidation.textContent(),
    /blocked by shared source diagnostics/i,
  );
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );
  assert.deepEqual(await readCenterPixel(page), editedPixel);
  await page
    .getByText("Last successful GLSL ES 3.00 render remains visible.")
    .waitFor();
  await page
    .getByText("Last successful WGSL render remains visible.")
    .waitFor();
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    editedGpuPixel,
  );

  const missingImportSource = `import { createFragmentShader, vec4 } from "shdr";
import { helper } from "./missing-helper.shdr.ts";

export default createFragmentShader(({ uniforms }) =>
  vec4(helper(uniforms.time)),
);
`;
  await compileSource(page, editor, missingImportSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1300/);
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );
  assert.deepEqual(await readCenterPixel(page), editedPixel);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    editedGpuPixel,
  );
  await compileSource(page, editor, originalSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");

  const derivativeSource = `import { createFragmentShader, dFdx, dFdy, fwidth, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  return vec4(
    0.25 + dFdx(uv.x),
    0.25 + dFdy(uv.y),
    0.25 + fwidth(uv.x),
    1,
  );
});
`;
  await compileSource(page, editor, derivativeSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  assert.doesNotMatch(await diagnostics.textContent(), /SHDR\d{4}/);
  await glslTab.click();
  const derivativeGlsl = await page.getByRole("tabpanel").textContent();
  assert.match(derivativeGlsl, /dFdx\(/);
  assert.match(derivativeGlsl, /\(-dFdy\(/);
  assert.match(derivativeGlsl, /fwidth\(/);
  await wgslTab.click();
  const derivativeWgsl = await page.getByRole("tabpanel").textContent();
  assert.match(derivativeWgsl, /dpdx\(/);
  assert.match(derivativeWgsl, /dpdy\(/);
  assert.match(derivativeWgsl, /fwidth\(/);
  await glslTab.click();
  const derivativeGlPixel = await readWebGlPixels(page, [[0.5, 0.5]]);
  const derivativeGpuPixel = await readWebGpuPixels(page, [[0.5, 0.5]]);

  const invalidDerivativeSource = derivativeSource.replace(
    "dFdy(uv.y)",
    "dFdy(uv.y, uv.y)",
  );
  await compileSource(page, editor, invalidDerivativeSource);
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1208/);
  assert.match(
    await glslValidation.textContent(),
    /blocked by shared source diagnostics/i,
  );
  await page
    .getByText("Last successful GLSL ES 3.00 render remains visible.")
    .waitFor();
  await page
    .getByText("Last successful WGSL render remains visible.")
    .waitFor();
  assert.deepEqual(
    await readWebGlPixels(page, [[0.5, 0.5]]),
    derivativeGlPixel,
  );
  assert.deepEqual(
    await readWebGpuPixels(page, [[0.5, 0.5]]),
    derivativeGpuPixel,
  );

  const missingDerivativeImport = derivativeSource.replace("dFdx, ", "");
  await compileSource(page, editor, missingDerivativeImport);
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1106/);
  assert.deepEqual(
    await readWebGlPixels(page, [[0.5, 0.5]]),
    derivativeGlPixel,
  );
  assert.deepEqual(
    await readWebGpuPixels(page, [[0.5, 0.5]]),
    derivativeGpuPixel,
  );

  await compileSource(page, editor, derivativeSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  await compileSource(page, editor, originalSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");

  await verifyCustomUniforms(
    page,
    editor,
    diagnostics,
    glslValidation,
    wgslValidation,
  );

  const mouseSource = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const mouse = uniforms.mouse / uniforms.resolution;
  const color = vec4(mouse.x, mouse.y, 0, 1);

  return color;
});
`;
  await compileSource(page, editor, mouseSource);
  await waitForValidation(page, "glsl-es-300", "success");
  await assertBindings(page, "glsl-es-300", "resolution,mouse");

  await canvas.scrollIntoViewIfNeeded();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas has no browser layout box.");
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.25,
    canvasBox.y + canvasBox.height * 0.2,
  );
  await assertBindings(page, "wgsl", "resolution,mouse");
  await assertSharedMouse(page, 0.25, 0.2);
  await assertPixelParity(page, "pointer over WebGL", [[0.5, 0.5]], 5);
  const gpuBox = await gpuCanvas.boundingBox();
  if (!gpuBox) throw new Error("WebGPU canvas has no browser layout box");
  await page.mouse.move(
    gpuBox.x + gpuBox.width * 0.72,
    gpuBox.y + gpuBox.height * 0.8,
  );
  await assertSharedMouse(page, 0.72, 0.8);
  await assertPixelParity(page, "pointer over WebGPU", [[0.5, 0.5]], 5);
  assertChannel("WebGPU pointer red", (await readCenterPixel(page))[0], 184, 5);

  const timeSource = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const elapsed = uniforms.time / 20;
  const color = vec4(elapsed, 0, 0, 1);

  return color;
});
`;
  await compileSource(page, editor, timeSource);
  await assertBindings(page, "glsl-es-300", "time");
  await assertBindings(page, "wgsl", "time");
  await page.waitForTimeout(800);
  const beforeReset = await readCenterPixel(page);
  const gpuBeforeReset = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  // Reinstall the same time-driven shader: a new clock must start at zero.
  await compileSource(page, editor, timeSource);
  await assertBindings(page, "glsl-es-300", "time");
  await assertBindings(page, "wgsl", "time");
  const timePixelBefore = await readCenterPixel(page);
  const gpuTimePixelBefore = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  assert.ok(
    beforeReset[0] > timePixelBefore[0] + 3,
    `WebGL time did not reset: ${beforeReset[0]} -> ${timePixelBefore[0]}`,
  );
  assert.ok(
    gpuBeforeReset[0] > gpuTimePixelBefore[0] + 3,
    `WebGPU time did not reset: ${gpuBeforeReset[0]} -> ${gpuTimePixelBefore[0]}`,
  );
  assertNear(
    "shared time origin pixel",
    timePixelBefore[0],
    gpuTimePixelBefore[0],
    5,
  );
  await page.waitForTimeout(300);
  const timePixelAfter = await readCenterPixel(page);
  const gpuTimePixelAfter = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  assert.ok(
    timePixelAfter[0] > timePixelBefore[0],
    `WebGL time did not advance: ${timePixelBefore[0]} -> ${timePixelAfter[0]}`,
  );
  assert.ok(
    gpuTimePixelAfter[0] > gpuTimePixelBefore[0],
    `WebGPU time did not advance: ${gpuTimePixelBefore[0]} -> ${gpuTimePixelAfter[0]}`,
  );
  assertNear(
    "shared time after advance pixel",
    timePixelAfter[0],
    gpuTimePixelAfter[0],
    5,
  );
  await assertPixelParity(page, "advancing time", [[0.5, 0.5]], 5);
  const allUniformsSource = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const mouse = uniforms.mouse / uniforms.resolution;
  return vec4(uv.x, mouse.y, uniforms.time / 20, 1);
});`;
  await compileSource(page, editor, allUniformsSource);
  await waitForValidation(page, "wgsl", "success");
  await assertBindings(page, "glsl-es-300", "resolution,mouse,time");
  await assertBindings(page, "wgsl", "resolution,mouse,time");
  await assertPixelParity(page, "all three uniforms", [[0.25, 0.75]], 5);
  await verifyDprAndResize(browser, address.port, mouseSource, originalSource);
  await verifyUnavailableFallbacks(browser, address.port);
  await verifyBackendFailureAndRaces(browser, address.port);

  assert.ok(
    corsErrors.length >= 2,
    "The denied texture must produce visible browser CORS errors.",
  );
  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log(
    `Verified REPL custom uniforms, math builtins, representative mix/step cells, all automatic uniforms, canonical coordinates, and WGSL status (${wgslState}).`,
  );
} finally {
  if (browser) await browser.close();
  await server.close();
}

async function verifyCustomUniforms(
  page,
  editor,
  diagnostics,
  glslValidation,
  wgslValidation,
) {
  const inline = await readFile(
    new URL("../vite-basic/src/custom-demo-inline.shdr.ts", import.meta.url),
    "utf8",
  );
  const named = await readFile(
    new URL("../vite-basic/src/custom-demo-named.shdr.ts", import.meta.url),
    "utf8",
  );
  await compileSource(page, editor, inline);
  await assertBindings(page, "glsl-es-300", "");
  await assertBindings(page, "wgsl", "");
  await assertCustomPixel(page, "inline authored defaults", [51, 102, 64, 255]);
  await page.getByRole("button", { name: "Set example uniforms" }).click();
  await assertCustomPixel(
    page,
    "erased live-editor host update",
    [191, 64, 128, 255],
  );
  await compileSource(page, editor, named);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  await assertCustomPixel(
    page,
    "same schema preserves explicit overrides",
    [191, 64, 128, 255],
  );
  await page.getByRole("button", { name: "Reset custom defaults" }).click();
  await assertCustomPixel(
    page,
    "named defaults after reset",
    [153, 51, 191, 255],
  );

  const editedDefaults = named.replace("u.f32(0.75)", "u.f32(0.3)");
  await compileSource(page, editor, editedDefaults);
  await waitForValidation(page, "wgsl", "success");
  await assertCustomPixel(page, "live edited defaults", [153, 51, 77, 255]);
  await page.getByRole("button", { name: "Set example uniforms" }).click();
  await assertCustomPixel(page, "new explicit overrides", [191, 64, 128, 255]);
  const changedSchema = `import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({
  color: u.f32(0.1),
  gain: u.f32(0.3),
  spin: u.f32(0.6),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color, uniforms.gain, uniforms.spin, 1),
);`;
  await compileSource(page, editor, changedSchema);
  await waitForValidation(page, "glsl-es-300", "success");
  await waitForValidation(page, "wgsl", "success");
  await assertCustomPixel(
    page,
    "changed schema prunes vector but carries scalar",
    [26, 128, 153, 255],
  );
  assert.equal(
    await page.getByRole("button", { name: "Set example uniforms" }).count(),
    0,
  );
  await compileSource(page, editor, inline);
  await waitForValidation(page, "wgsl", "success");
  await assertCustomPixel(
    page,
    "pruned vector does not reappear",
    [51, 102, 128, 255],
  );
  await page.getByRole("button", { name: "Reset custom defaults" }).click();
  await assertCustomPixel(
    page,
    "reset current inline defaults",
    [51, 102, 64, 255],
  );
  const lastGoodGl = await readCenterPixel(page);
  const lastGoodGpu = (await readWebGpuPixels(page, [[0.5, 0.5]]))[0];
  await compileSource(
    page,
    editor,
    inline.replace("u.f32(0.25)", "u.f32(window.devicePixelRatio)"),
  );
  await waitForValidation(page, "glsl-es-300", "blocked");
  await waitForValidation(page, "wgsl", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1210/);
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );
  assert.match(
    await glslValidation.textContent(),
    /blocked by shared source diagnostics/i,
  );
  assert.deepEqual(await readCenterPixel(page), lastGoodGl);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    lastGoodGpu,
  );
  await compileSource(
    page,
    editor,
    inline.replace("uniforms.gain", "uniforms.missing"),
  );
  await page.waitForFunction(() =>
    document.querySelector(".diagnostics")?.textContent?.includes("SHDR1203"),
  );
  await waitForValidation(page, "glsl-es-300", "blocked");
  assert.match(await diagnostics.textContent(), /SHDR1203/);
  assert.deepEqual(await readCenterPixel(page), lastGoodGl);
  assert.deepEqual(
    (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    lastGoodGpu,
  );
}

async function assertCustomPixel(page, name, expected) {
  const deadline = Date.now() + 5_000;
  let gl, gpu;
  do {
    [gl, gpu] = await Promise.all([
      readWebGlPixels(page, [[0.5, 0.5]]),
      readWebGpuPixels(page, [[0.5, 0.5]]),
    ]);
    if (
      [gl[0], gpu[0]].every((pixel) =>
        pixel.every((value, index) => Math.abs(value - expected[index]) <= 4),
      )
    )
      return;
    await page.waitForTimeout(40);
  } while (Date.now() < deadline);
  assert.fail(
    `${name}: WebGL ${gl?.[0]}, WebGPU ${gpu?.[0]}, expected ${expected} (±4).`,
  );
}

async function verifyDprAndResize(browser, port, mouseSource, gradientSource) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    await waitForValidation(page, "wgsl", "success");
    for (const target of ["glsl-es-300", "wgsl"]) {
      const metrics = await readCanvasMetrics(page, target);
      assert.equal(metrics.width, Math.round(metrics.cssWidth * 2));
      assert.equal(metrics.height, Math.round(metrics.cssHeight * 2));
    }
    await assertEqualBuffers(page);
    await assertPixelParity(
      page,
      "DPR 2 gradient",
      [
        [0.25, 0.25],
        [0.75, 0.75],
      ],
      5,
    );
    const editor = page.getByRole("textbox", { name: "Shader source editor" });
    await compileSource(page, editor, mouseSource);
    await assertBindings(page, "wgsl", "resolution,mouse");
    const gpuCanvas = page.locator('[data-render-target="wgsl"]');
    await gpuCanvas.scrollIntoViewIfNeeded();
    const box = await gpuCanvas.boundingBox();
    if (!box) throw new Error("No DPR 2 WebGPU canvas box");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await assertSharedMouse(page, 0.3, 0.7);
    const initialWidth = (await readCanvasMetrics(page)).width;
    await page.setViewportSize({ width: 680, height: 850 });
    await page.waitForFunction(
      (old) =>
        [...document.querySelectorAll("[data-render-target]")].every(
          (canvas) => canvas.width !== old,
        ),
      initialWidth,
    );
    await assertEqualBuffers(page);
    await assertSharedMouse(page, 0.3, 0.7);
    const boxes = await Promise.all([
      page.locator('[data-render-target="glsl-es-300"]').boundingBox(),
      gpuCanvas.boundingBox(),
    ]);
    if (!boxes[0] || !boxes[1] || boxes[1].y < boxes[0].y + boxes[0].height)
      throw new Error("Narrow previews did not stack vertically");
    await compileSource(page, editor, gradientSource);
    await waitForValidation(page, "wgsl", "success");
    await assertPixelParity(
      page,
      "DPR 2 resized gradient",
      [
        [0.25, 0.25],
        [0.75, 0.75],
      ],
      5,
    );
  } finally {
    await context.close();
  }
}

async function verifyUnavailableFallbacks(browser, port) {
  for (const absence of ["api", "adapter"]) {
    const context = await browser.newContext();
    try {
      await context.addInitScript((mode) => {
        if (mode === "api") {
          Object.defineProperty(navigator, "gpu", {
            configurable: true,
            value: undefined,
          });
        } else {
          navigator.gpu.requestAdapter = async () => null;
        }
      }, absence);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}`);
      await waitForValidation(page, "glsl-es-300", "success");
      await waitForValidation(page, "wgsl", "unavailable");
      const unavailable = await page
        .locator('[data-validation-target="wgsl"]')
        .textContent();
      assert.match(unavailable, /unavailable|no adapter/i);
      const editor = page.getByRole("textbox", {
        name: "Shader source editor",
      });
      await compileSource(page, editor, shaderColor("vec4(0, 0.75, 0, 1)"));
      await waitForValidation(page, "glsl-es-300", "success");
      assert.equal(
        await page
          .locator('[data-validation-target="wgsl"]')
          .getAttribute("data-validation-state"),
        "unavailable",
      );
      assertChannel(
        `${absence} fallback WebGL green`,
        (await readCenterPixel(page))[1],
        191,
        2,
      );
      const customSource = await readFile(
        new URL(
          "../vite-basic/src/custom-demo-inline.shdr.ts",
          import.meta.url,
        ),
        "utf8",
      );
      await compileSource(page, editor, customSource);
      await page.waitForFunction(() => {
        const canvas = document.querySelector(
          '[data-render-target="glsl-es-300"]',
        );
        const gl = canvas?.getContext("webgl2");
        if (!gl) return false;
        const rgba = new Uint8Array(4);
        gl.readPixels(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          rgba,
        );
        return Math.abs(rgba[0] - 51) <= 4;
      });
      await waitForValidation(page, "glsl-es-300", "success");
      assert.equal(
        await page
          .locator('[data-validation-target="wgsl"]')
          .getAttribute("data-validation-state"),
        "unavailable",
      );
      const customPixel = await readCenterPixel(page);
      for (const [index, expected] of [51, 102, 64, 255].entries())
        assertChannel(
          `${absence} custom WebGL channel ${index}`,
          customPixel[index],
          expected,
          4,
        );
      await page.getByRole("tab", { name: "WGSL" }).click();
      assert.match(await page.getByRole("tabpanel").textContent(), /@fragment/);
    } finally {
      await context.close();
    }
  }
}

async function verifyBackendFailureAndRaces(browser, port) {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      const gpu = navigator.gpu;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await requestAdapter(...args);
        if (!adapter) return adapter;
        return new Proxy(adapter, {
          get(target, property) {
            if (property === "requestDevice")
              return async (...options) => {
                const device = await target.requestDevice(...options);
                window.testGpuDevice = device;
                const createPipeline =
                  device.createRenderPipelineAsync.bind(device);
                device.createRenderPipelineAsync = (...descriptors) => {
                  if (window.testFailPipeline) {
                    window.testFailPipeline = false;
                    return Promise.reject(
                      new Error("Injected WGSL pipeline failure"),
                    );
                  }
                  if (window.testDelayPipelineMs) {
                    const delay = window.testDelayPipelineMs;
                    window.testDelayPipelineMs = 0;
                    return new Promise((resolve) =>
                      setTimeout(resolve, delay),
                    ).then(() => createPipeline(...descriptors));
                  }
                  return createPipeline(...descriptors);
                };
                return device;
              };
            return Reflect.get(target, property, target);
          },
        });
      };
    });
    const page = await context.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await waitForValidation(page, "wgsl", "success");
    assert.equal(
      await page.evaluate(() => Boolean(window.testGpuDevice)),
      true,
    );
    const editor = page.getByRole("textbox", { name: "Shader source editor" });
    const green = shaderColor("vec4(0, 0.75, 0, 1)");
    const red = shaderColor("vec4(1, 0, 0, 1)");
    const blue = shaderColor("vec4(0, 0, 1, 1)");
    const yellow = shaderColor("vec4(1, 1, 0, 1)");
    await compileSource(page, editor, green);
    await waitForValidation(page, "wgsl", "success");
    assertChannel(
      "pre-failure green",
      (await readWebGpuPixels(page, [[0.5, 0.5]]))[0][1],
      191,
      2,
    );

    await page.evaluate(() => {
      window.testFailPipeline = true;
    });
    await compileSource(page, editor, red);
    await waitForValidation(page, "wgsl", "error");
    assert.match(
      await page.locator('[data-validation-target="wgsl"]').textContent(),
      /pipeline creation failed.*Injected WGSL pipeline failure/i,
    );
    assert.match(
      await page.getByRole("region", { name: "Diagnostics" }).textContent(),
      /No shared compiler diagnostics/,
    );
    assert.equal(
      await page
        .locator('[data-validation-target="glsl-es-300"]')
        .getAttribute("data-validation-state"),
      "success",
    );
    assertChannel(
      "WebGL updated independently",
      (await readCenterPixel(page))[0],
      255,
      2,
    );
    assertChannel(
      "WebGPU preserved last frame",
      (await readWebGpuPixels(page, [[0.5, 0.5]]))[0][1],
      191,
      2,
    );
    await page.getByRole("tab", { name: "WGSL" }).click();
    assert.match(await page.getByRole("tabpanel").textContent(), /@fragment/);
    await page
      .getByText("Last successful WGSL render remains visible.")
      .waitFor();

    await page.evaluate(() => {
      window.testDelayPipelineMs = 220;
    });
    await compileSource(page, editor, blue);
    await page.waitForFunction(() => window.testDelayPipelineMs === 0);
    await compileSource(page, editor, yellow);
    await waitForValidation(page, "wgsl", "success");
    await page.waitForTimeout(260);
    for (const pixel of [
      await readCenterPixel(page),
      (await readWebGpuPixels(page, [[0.5, 0.5]]))[0],
    ]) {
      assertChannel("latest red", pixel[0], 255, 2);
      assertChannel("latest green", pixel[1], 255, 2);
      assertChannel("latest blue", pixel[2], 0, 2);
    }

    // A source diagnostic cancels an in-flight GPU pipeline. WebGL has
    // already drawn blue; WebGPU still displays its last valid yellow.
    await page.evaluate(() => {
      window.testDelayPipelineMs = 250;
    });
    await compileSource(page, editor, blue);
    await page.waitForFunction(() => window.testDelayPipelineMs === 0);
    await compileSource(
      page,
      editor,
      `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  return vec4(uniforms.missing, 0, 0, 1);
});`,
    );
    await waitForValidation(page, "glsl-es-300", "blocked");
    await waitForValidation(page, "wgsl", "blocked");
    await page.waitForTimeout(300);
    assertChannel(
      "blocked WebGL last frame",
      (await readCenterPixel(page))[2],
      255,
      2,
    );
    assertChannel(
      "blocked WebGPU last frame",
      (await readWebGpuPixels(page, [[0.5, 0.5]]))[0][1],
      255,
      2,
    );
    await compileSource(page, editor, green);
    await waitForValidation(page, "wgsl", "success");

    // Real GPUDevice destruction, not a simulated status transition.
    await page.evaluate(async () => {
      window.testGpuDevice.destroy();
      await window.testGpuDevice.lost;
    });
    await waitForValidation(page, "wgsl", "error");
    assert.match(
      await page.locator('[data-validation-target="wgsl"]').textContent(),
      /device lost/i,
    );
    assert.equal(
      await page
        .locator('[data-validation-target="glsl-es-300"]')
        .getAttribute("data-validation-state"),
      "success",
    );
    await compileSource(page, editor, red);
    await waitForValidation(page, "glsl-es-300", "success");
    assertChannel(
      "WebGL after device loss",
      (await readCenterPixel(page))[0],
      255,
      2,
    );
    assert.equal(
      await page
        .locator('[data-validation-target="wgsl"]')
        .getAttribute("data-validation-state"),
      "error",
    );
    assert.match(await page.getByRole("tabpanel").textContent(), /@fragment/);
    assert.deepEqual(browserErrors, []);
  } finally {
    await context.close();
  }
}

async function assertEqualBuffers(page) {
  const metrics = await Promise.all([
    readCanvasMetrics(page, "glsl-es-300"),
    readCanvasMetrics(page, "wgsl"),
  ]);
  assert.equal(metrics[0].width, metrics[1].width);
  assert.equal(metrics[0].height, metrics[1].height);
}

async function compileSource(page, editor, source) {
  await editor.fill(source);
  await page.getByRole("button", { name: "Compile both targets" }).click();
}

async function waitForValidation(page, target, state) {
  await page.waitForFunction(
    ({ target, state }) =>
      document
        .querySelector(`[data-validation-target="${target}"]`)
        ?.getAttribute("data-validation-state") === state,
    { target, state },
  );
}

async function assertBindings(page, target, bindings) {
  await waitForValidation(page, target, "success");
  const message = await page
    .locator(`[data-validation-target="${target}"] .render-message`)
    .textContent();
  assert.ok(
    message.includes(
      `Bound uniforms: ${bindings ? bindings.split(",").join(", ") : "none"}.`,
    ),
    `${target} did not report ${bindings || "none"} bindings: ${message}`,
  );
}

async function readGradientSamples(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-render-target="glsl-es-300"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The render canvas is unavailable.");
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("The WebGL 2 context is unavailable.");
    const sample = (x, y) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };
    return {
      width: canvas.width,
      height: canvas.height,
      center: sample(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
      ),
      top: sample(Math.floor(canvas.width / 2), canvas.height - 1),
      bottom: sample(Math.floor(canvas.width / 2), 0),
    };
  });
}

async function readCenterPixel(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-render-target="glsl-es-300"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The render canvas is unavailable.");
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("The WebGL 2 context is unavailable.");
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    return [...pixel];
  });
}

async function readCanvasMetrics(page, target = "glsl-es-300") {
  return page.evaluate((selected) => {
    const canvas = document.querySelector(`[data-render-target="${selected}"]`);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The render canvas is unavailable.");
    }
    const rect = canvas.getBoundingClientRect();
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelRatio: window.devicePixelRatio,
    };
  }, target);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  view.setUint32(8 + data.length, crc32(result.subarray(4, 8 + data.length)));
  return result;
}
function makePng(rows) {
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
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  ];
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let output = 0;
  for (const part of parts) {
    bytes.set(part, output);
    output += part.length;
  }
  return Buffer.from(bytes);
}

function shaderColor(color) {
  return `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  return ${color};
});`;
}

async function assertSharedMouse(page, x, y) {
  // The shader encodes normalized mouse position into RG. Check submitted
  // WebGL pixels and presented WebGPU pixels, not test-only canvas metadata.
  const expected = [Math.round(x * 255), Math.round(y * 255)];
  const deadline = Date.now() + 5_000;
  let actual;
  do {
    actual = await Promise.all([
      readWebGlPixels(page, [[0.5, 0.5]]),
      readWebGpuPixels(page, [[0.5, 0.5]]),
    ]);
    if (
      actual.every(([pixel]) =>
        expected.every(
          (value, channel) => Math.abs(pixel[channel] - value) <= 5,
        ),
      )
    )
      return;
    await page.waitForTimeout(30);
  } while (Date.now() < deadline);
  throw new Error(
    `Both previews did not receive pointer (${x}, ${y}): ${JSON.stringify(actual)}`,
  );
}

async function assertPixelParity(page, name, locations, tolerance) {
  const [glsl, wgsl] = await Promise.all([
    readWebGlPixels(page, locations),
    readWebGpuPixels(page, locations),
  ]);
  for (let index = 0; index < locations.length; index++) {
    for (let channel = 0; channel < 4; channel++) {
      assertNear(
        `${name} at ${locations[index].join(",")} channel ${channel} (WebGL vs WebGPU)`,
        glsl[index][channel],
        wgsl[index][channel],
        tolerance,
      );
    }
  }
}

async function readWebGlPixels(page, locations) {
  return page.evaluate((points) => {
    const canvas = document.querySelector('[data-render-target="glsl-es-300"]');
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error("Missing WebGL canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("Missing WebGL 2 context");
    return points.map(([x, y]) => {
      const rgba = new Uint8Array(4);
      gl.readPixels(
        Math.min(canvas.width - 1, Math.floor(canvas.width * x)),
        canvas.height -
          1 -
          Math.min(canvas.height - 1, Math.floor(canvas.height * y)),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rgba,
      );
      return [...rgba];
    });
  }, locations);
}

async function readWebGpuPixels(page, locations) {
  // Chromium screenshots contain the presented WebGPU canvas. Decode on a
  // separate 2D canvas; getImageData cannot use a WebGPU canvas context.
  const png = await page.locator('[data-render-target="wgsl"]').screenshot();
  return page.evaluate(
    async ({ bytes, points }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const copy = document.createElement("canvas");
      copy.width = image.width;
      copy.height = image.height;
      const ctx = copy.getContext("2d");
      if (!ctx) throw new Error("Missing 2D pixel decoder");
      ctx.drawImage(image, 0, 0);
      const pixels = points.map(([x, y]) => [
        ...ctx.getImageData(
          Math.min(copy.width - 1, Math.floor(copy.width * x)),
          Math.min(copy.height - 1, Math.floor(copy.height * y)),
          1,
          1,
        ).data,
      ]);
      image.close();
      return pixels;
    },
    { bytes: [...png], points: locations },
  );
}

function assertChannel(name, actual, expected, tolerance) {
  assertNear(name, actual, expected, tolerance);
}

function assertNear(name, actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${name} was ${actual}; expected ${expected} ± ${tolerance}`,
  );
}

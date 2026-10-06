import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
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
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
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
  assert.match(
    await page.getByRole("tabpanel").textContent(),
    /u_resolution\.y - gl_FragCoord\.y/,
  );
  await wgslTab.click();
  assert.equal(await wgslTab.getAttribute("aria-selected"), "true");
  const wgslOutput = await page.getByRole("tabpanel").textContent();
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
  const plasmaSource = await readFile(
    new URL("../vite-basic/src/references/plasma.shdr.ts", import.meta.url),
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
      "../vite-basic/src/references/horizon-burn.shdr.ts",
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

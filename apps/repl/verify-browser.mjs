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

  const canvas = page.locator("canvas");
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
  assert.equal(await canvas.getAttribute("data-bound-uniforms"), "resolution");

  const wgslValidation = page.locator('[data-validation-target="wgsl"]');
  const wgslState = await wgslValidation.getAttribute("data-validation-state");
  assert.ok(
    wgslState === "success" || wgslState === "unavailable",
    `Unexpected WGSL validation state: ${wgslState}`,
  );
  if (wgslState === "success") {
    assert.match(await wgslValidation.textContent(), /compiled successfully/i);
  } else {
    assert.match(await wgslValidation.textContent(), /unavailable|no adapter/i);
  }

  const initial = await readGradientSamples(page);
  assertChannel("center red", initial.center[0], 128, 3);
  assertChannel("center green", initial.center[1], 128, 3);
  assertChannel("top green", initial.top[1], 0, 3);
  assertChannel("bottom green", initial.bottom[1], 255, 3);
  assertChannel("initial blue", initial.center[2], 0, 1);
  assertChannel("initial alpha", initial.center[3], 255, 1);

  const initialWidth = initial.width;
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForFunction((previousWidth) => {
    const target = document.querySelector("canvas");
    if (!(target instanceof HTMLCanvasElement)) return false;
    return (
      target.width !== previousWidth &&
      target.dataset.resolution === `${target.width},${target.height}`
    );
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
  assert.match(wgslOutput, /\(shdr_coord\)\.xy/);
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
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-validation-target="wgsl"]')
        ?.getAttribute("data-validation-state") !== "pending",
  );
  assert.ok(
    ["success", "unavailable"].includes(
      await wgslValidation.getAttribute("data-validation-state"),
    ),
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
  assert.equal(await canvas.getAttribute("data-bound-uniforms"), "resolution");
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
    .getByText("The canvas preserves the last successful GLSL render.")
    .waitFor();

  const mouseSource = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const mouse = uniforms.mouse / uniforms.resolution;
  const color = vec4(mouse.x, mouse.y, 0, 1);

  return color;
});
`;
  await compileSource(page, editor, mouseSource);
  await waitForValidation(page, "glsl-es-300", "success");
  assert.equal(
    await canvas.getAttribute("data-bound-uniforms"),
    "resolution,mouse",
  );

  await canvas.scrollIntoViewIfNeeded();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas has no browser layout box.");
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.25,
    canvasBox.y + canvasBox.height * 0.2,
  );
  await page.waitForFunction(() => {
    const target = document.querySelector("canvas");
    if (!(target instanceof HTMLCanvasElement)) return false;
    const [x, y] = (target.dataset.mouse ?? "").split(",").map(Number);
    return x > target.width * 0.2 && y > target.height * 0.15;
  });
  const mouseMetrics = await readRuntimeMetrics(page);
  assertNear("mouse X", mouseMetrics.mouseX, mouseMetrics.width * 0.25, 2);
  assertNear("mouse Y", mouseMetrics.mouseY, mouseMetrics.height * 0.2, 2);
  const mousePixel = await readCenterPixel(page);
  assertChannel("mouse red", mousePixel[0], 64, 4);
  assertChannel("mouse green", mousePixel[1], 51, 4);

  const timeSource = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const elapsed = uniforms.time / 20;
  const color = vec4(elapsed, 0, 0, 1);

  return color;
});
`;
  await page.waitForTimeout(500);
  const previousShaderTime = await readRuntimeMetrics(page);
  await compileSource(page, editor, timeSource);
  await waitForValidation(page, "glsl-es-300", "success");
  assert.equal(await canvas.getAttribute("data-bound-uniforms"), "time");
  const timeBefore = await readRuntimeMetrics(page);
  assert.ok(
    timeBefore.time < previousShaderTime.time,
    `u_time did not reset after compilation: ${previousShaderTime.time} -> ${timeBefore.time}`,
  );
  const timePixelBefore = await readCenterPixel(page);
  await page.waitForTimeout(300);
  const timeAfter = await readRuntimeMetrics(page);
  const timePixelAfter = await readCenterPixel(page);
  assert.ok(timeAfter.time > timeBefore.time, "u_time did not advance.");
  assert.ok(
    timePixelAfter[0] > timePixelBefore[0],
    `Time-driven red channel did not increase: ${timePixelBefore[0]} -> ${timePixelAfter[0]}`,
  );

  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log(
    `Verified REPL rendering, all default uniforms, canonical coordinates, and WGSL status (${wgslState}).`,
  );
} finally {
  if (browser) await browser.close();
  await server.close();
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

async function readGradientSamples(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
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
    const canvas = document.querySelector("canvas");
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

async function readCanvasMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
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
  });
}

async function readRuntimeMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The render canvas is unavailable.");
    }
    const [mouseX, mouseY] = (canvas.dataset.mouse ?? "")
      .split(",")
      .map(Number);
    return {
      width: canvas.width,
      height: canvas.height,
      mouseX,
      mouseY,
      time: Number(canvas.dataset.time),
    };
  });
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

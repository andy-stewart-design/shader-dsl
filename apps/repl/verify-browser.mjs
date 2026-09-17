import assert from "node:assert/strict";
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
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-validation-target="glsl-es-300"]')
        ?.getAttribute("data-validation-state") === "success" &&
      document
        .querySelector('[data-validation-target="wgsl"]')
        ?.getAttribute("data-validation-state") !== "pending",
  );

  const glslValidation = page.locator(
    '[data-validation-target="glsl-es-300"]',
  );
  assert.equal(await glslValidation.getAttribute("data-validation-state"), "success");
  assert.match(await glslValidation.textContent(), /compiled, linked, and rendered/i);

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

  const initialPixel = await readCenterPixel(page);
  assertChannel("initial blue", initialPixel[2], 0, 1);
  assertChannel("initial alpha", initialPixel[3], 255, 1);

  const glslTab = page.getByRole("tab", { name: "GLSL ES 3.00" });
  const wgslTab = page.getByRole("tab", { name: "WGSL" });
  assert.equal(await glslTab.getAttribute("aria-selected"), "true");
  assert.match(await page.getByRole("tabpanel").textContent(), /#version 300 es/);
  await wgslTab.click();
  assert.equal(await wgslTab.getAttribute("aria-selected"), "true");
  assert.match(await page.getByRole("tabpanel").textContent(), /@fragment/);
  await glslTab.click();

  const editor = page.getByRole("textbox", { name: "Shader source editor" });
  const originalSource = await editor.inputValue();
  await editor.fill(
    originalSource.replace(
      "vec4(uv.x, uv.y, 0, 1)",
      "vec4(uv.x, uv.y, 0.75, 1)",
    ),
  );
  await page.getByRole("button", { name: "Compile both targets" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-validation-target="glsl-es-300"]')
        ?.getAttribute("data-validation-state") === "success" &&
      document.querySelector('[data-target="glsl-es-300"]')?.textContent?.includes("0.75"),
  );

  const editedPixel = await readCenterPixel(page);
  assert.notDeepEqual(editedPixel, initialPixel);
  assertChannel("edited blue", editedPixel[2], 191, 3);
  assertChannel("edited alpha", editedPixel[3], 255, 1);

  await editor.fill(
    originalSource.replace("uniforms.resolution", "uniforms.missing"),
  );
  await page.getByRole("button", { name: "Compile both targets" }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-validation-target="glsl-es-300"]')?.getAttribute(
      "data-validation-state",
    ) === "blocked",
  );
  assert.match(
    await page.getByRole("region", { name: "Diagnostics" }).textContent(),
    /SHDR1203/,
  );
  assert.match(await glslValidation.textContent(), /blocked by shared source diagnostics/i);
  assert.equal(
    await wgslValidation.getAttribute("data-validation-state"),
    "blocked",
  );

  const preservedPixel = await readCenterPixel(page);
  assert.deepEqual(preservedPixel, editedPixel);
  await page.getByText("The canvas preserves the last successful GLSL render.").waitFor();

  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log(
    `Verified REPL target selection, WebGL rendering, preserved output, and WGSL status (${wgslState}).`,
  );
} finally {
  if (browser) await browser.close();
  await server.close();
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
    gl.readPixels(256, 255, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  });
}

function assertChannel(name, actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${name} was ${actual}; expected ${expected} ± ${tolerance}`,
  );
}

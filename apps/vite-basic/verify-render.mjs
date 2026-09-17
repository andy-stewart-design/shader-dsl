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
  const canvas = page.locator("#shader-canvas");
  await canvas.waitFor();
  await page.waitForFunction(() =>
    ["success", "error"].includes(
      document
        .querySelector("#shader-canvas")
        ?.getAttribute("data-render-status") ?? "",
    ),
  );

  const renderState = await page.evaluate(() => ({
    status: document
      .querySelector("#shader-canvas")
      ?.getAttribute("data-render-status"),
    message: document.querySelector("#status")?.textContent,
  }));
  if (renderState.status !== "success") {
    throw new Error(`Shader render failed: ${renderState.message ?? "unknown error"}`);
  }

  const samples = await page.evaluate(() => {
    const target = document.querySelector("#shader-canvas");
    if (!(target instanceof HTMLCanvasElement)) {
      throw new Error("Shader canvas is unavailable.");
    }
    const gl = target.getContext("webgl2");
    if (!gl) throw new Error("WebGL 2 context is unavailable.");

    gl.finish();
    const sample = (x, y) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };

    // readPixels uses a bottom-left origin. The named rows refer to the
    // canonical top-left-origin coordinates produced by the shader.
    const result = {
      center: sample(256, 255),
      top: sample(256, target.height - 1),
      bottom: sample(256, 0),
      error: gl.getError(),
    };
    return result;
  });

  if (samples.error !== 0) {
    throw new Error(`WebGL readback failed with error 0x${samples.error.toString(16)}.`);
  }
  assertPixel("center", samples.center, [128, 128, 0, 255], 3);
  assertPixel("top row", samples.top, [128, 0, 0, 255], 3);
  assertPixel("bottom row", samples.bottom, [128, 255, 0, 255], 3);

  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log("Verified rendered gradient pixels and top-left Y semantics.");
} finally {
  if (browser) await browser.close();
  await server.close();
}

function assertPixel(name, actual, expected, tolerance) {
  const channels = ["red", "green", "blue", "alpha"];
  for (let index = 0; index < channels.length; index += 1) {
    if (Math.abs(actual[index] - expected[index]) > tolerance) {
      throw new Error(
        `${name} ${channels[index]} channel was ${actual[index]}, expected ${expected[index]} ± ${tolerance}; full pixel: [${actual.join(", ")}].`,
      );
    }
  }
}

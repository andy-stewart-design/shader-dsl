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
      "--enable-unsafe-webgpu",
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
    throw new Error(
      `Shader render failed: ${renderState.message ?? "unknown error"}`,
    );
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
    throw new Error(
      `WebGL readback failed with error 0x${samples.error.toString(16)}.`,
    );
  }
  assertPixel("center", samples.center, [128, 128, 0, 255], 3);
  assertPixel("top row", samples.top, [128, 0, 0, 255], 3);
  assertPixel("bottom row", samples.bottom, [128, 255, 0, 255], 3);

  await page.locator('#math-canvas[data-render-status="success"]').waitFor();
  const mathSamples = await page.evaluate(() => {
    const mathCanvas = document.querySelector("#math-canvas");
    if (!(mathCanvas instanceof HTMLCanvasElement)) {
      throw new Error("Math shader canvas is unavailable.");
    }
    const gl = mathCanvas.getContext("webgl2");
    if (!gl) throw new Error("Math shader WebGL 2 context is unavailable.");
    gl.finish();
    const sample = (x, y) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };
    return {
      center: sample(64, 64),
      corner: sample(32, 32),
      error: gl.getError(),
    };
  });
  if (mathSamples.error !== 0) {
    throw new Error(
      `Math shader readback failed with error 0x${mathSamples.error.toString(16)}.`,
    );
  }
  assertPixel("math center", mathSamples.center, [91, 112, 106, 255], 6);
  assertPixel("math corner", mathSamples.corner, [4, 34, 175, 255], 6);

  await page.locator('#webgpu-canvas[data-render-status="success"]').waitFor();
  const gpuPixels = await page.locator("#webgpu-canvas").screenshot();
  const gpuSample = await page.evaluate(
    async (png) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: "image/png" }),
      );
      const target = document.createElement("canvas");
      target.width = image.width;
      target.height = image.height;
      const context = target.getContext("2d");
      if (!context) throw new Error("No WebGPU screenshot readback context.");
      context.drawImage(image, 0, 0);
      return [
        ...context.getImageData(
          Math.floor(image.width / 2),
          Math.floor(image.height / 2),
          1,
          1,
        ).data,
      ];
    },
    [...gpuPixels],
  );
  assertPixel("static WGSL center", gpuSample, [128, 128, 0, 255], 5);

  await page
    .locator('#custom-gl-canvas[data-render-status="success"]')
    .waitFor();
  await page
    .locator('#custom-gpu-canvas[data-render-status="success"]')
    .waitFor();
  await assertCustomPixels(page, "instance first frame", [26, 77, 51, 255]);
  await page.getByRole("button", { name: "Reset all custom uniforms" }).click();
  await assertCustomPixels(page, "inline defaults", [51, 102, 64, 255]);
  await page.getByRole("button", { name: "Use named shader" }).click();
  await assertCustomPixels(
    page,
    "named defaults replace inline",
    [153, 51, 191, 255],
  );
  await page.getByRole("button", { name: "Set custom uniforms" }).click();
  await assertCustomPixels(page, "persistent host update", [179, 51, 204, 255]);
  await page.getByRole("button", { name: "Reset gain" }).click();
  await assertCustomPixels(page, "reset named gain", [179, 51, 191, 255]);
  await page.getByRole("button", { name: "Use inline shader" }).click();
  await assertCustomPixels(
    page,
    "compatible replacement carries explicit color",
    [179, 51, 64, 255],
  );
  await page.getByRole("button", { name: "Reset all custom uniforms" }).click();
  await assertCustomPixels(
    page,
    "reset current inline defaults",
    [51, 102, 64, 255],
  );

  const unavailable = await browser.newPage();
  await unavailable.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    }),
  );
  await unavailable.goto(`http://127.0.0.1:${address.port}`, {
    waitUntil: "load",
  });
  await unavailable
    .locator('#shader-canvas[data-render-status="success"]')
    .waitFor();
  await unavailable
    .locator('#webgpu-canvas[data-render-status="unavailable"]')
    .waitFor();
  await unavailable
    .locator('#custom-gl-canvas[data-render-status="success"]')
    .waitFor();
  await unavailable
    .locator('#custom-gpu-canvas[data-render-status="unavailable"]')
    .waitFor();
  await unavailable
    .getByRole("button", { name: "Set custom uniforms" })
    .click();
  await waitForCustomGl(unavailable, [179, 51, 204, 255]);
  await unavailable.close();

  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log(
    "Verified static GLSL/WGSL pixels, custom-uniform host flows, math shader, top-left Y and missing-WebGPU fallback.",
  );
} finally {
  if (browser) await browser.close();
  await server.close();
}

async function customGlPixel(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#custom-gl-canvas");
    const gl = canvas?.getContext("webgl2");
    if (!gl) throw new Error("Missing custom WebGL context.");
    const pixel = new Uint8Array(4);
    gl.finish();
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
async function customGpuPixel(page) {
  const screenshot = await page.locator("#custom-gpu-canvas").screenshot();
  return page.evaluate(
    async (png) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixel = [
        ...context.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data,
      ];
      image.close();
      return pixel;
    },
    [...screenshot],
  );
}
function closePixel(actual, expected, tolerance = 3) {
  return actual.every(
    (value, index) => Math.abs(value - expected[index]) <= tolerance,
  );
}
async function waitForCustomGl(page, expected) {
  const deadline = Date.now() + 5_000;
  let pixel;
  do {
    pixel = await customGlPixel(page);
    if (closePixel(pixel, expected)) return;
    await page.waitForTimeout(40);
  } while (Date.now() < deadline);
  assertPixel("custom WebGL", pixel, expected, 3);
}
async function assertCustomPixels(page, name, expected) {
  const deadline = Date.now() + 5_000;
  let gl, gpu;
  do {
    [gl, gpu] = await Promise.all([customGlPixel(page), customGpuPixel(page)]);
    if (closePixel(gl, expected) && closePixel(gpu, expected)) return;
    await page.waitForTimeout(40);
  } while (Date.now() < deadline);
  assertPixel(`${name} WebGL`, gl, expected, 3);
  assertPixel(`${name} presented WebGPU`, gpu, expected, 3);
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

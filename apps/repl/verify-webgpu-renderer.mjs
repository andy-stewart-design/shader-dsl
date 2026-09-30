import assert from "node:assert/strict";
import { compileFragment } from "@shdr/core";
import { chromium } from "playwright";
import { createServer } from "vite";

function shader(body) {
  const input = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});`;
  const result = compileFragment(input, { target: "wgsl" });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.code;
}

const red = shader("return vec4(1, 0, 0, 1);");
const green = shader("return vec4(0, 1, 0, 1);");
const withResolution = shader(
  "return vec4(coord.x / uniforms.resolution.x, 0, 0, 1);",
);
const timeOnly = shader("return vec4(uniforms.time / 20, 0, 0, 1);");
const withAll = shader(
  "return vec4(coord.x / uniforms.resolution.x, uniforms.mouse.y / uniforms.resolution.y, uniforms.time / 20, 1);",
);
const badEntry = green.replace("shdr_fragment_main", "other_fragment_main");

const root = new URL("./", import.meta.url).pathname;
const server = await createServer({
  root,
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
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const url = `http://127.0.0.1:${address.port}/`;
  await page.route(url, (route) =>
    route.fulfill({
      body: '<!doctype html><canvas id="webgpu" width="4" height="4" style="width:4px;height:4px"></canvas>',
    }),
  );
  await page.goto(url);
  const setup = await page.evaluate(
    async ({ red, withResolution, timeOnly, withAll, badEntry }) => {
      const { WebGpuRenderer } = await import("/src/webgpu-renderer.ts");
      const canvas = document.querySelector("#webgpu");
      if (!(canvas instanceof HTMLCanvasElement))
        throw new Error("Missing canvas");
      const gpu = navigator.gpu;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      // Intercept only the device request, to trigger a genuine device.lost
      // after testing all renderer behavior without a test-only renderer API.
      gpu.requestAdapter = async (...args) => {
        const adapter = await requestAdapter(...args);
        if (!adapter) return adapter;
        return new Proxy(adapter, {
          get(target, property) {
            if (property === "requestDevice")
              return async (...options) => {
                const device = await target.requestDevice(...options);
                window.testWebGpuDevice = device;
                return device;
              };
            return Reflect.get(target, property, target);
          },
        });
      };
      const lostMessages = [];
      window.testLostMessages = lostMessages;
      const renderer = await WebGpuRenderer.create(canvas, (message) =>
        lostMessages.push(message),
      );
      window.testWebGpuRenderer = renderer;
      const initial = await renderer.setFragmentShader(red);
      const noBindings = canvas.dataset.boundUniforms;
      const resolution = await renderer.setFragmentShader(withResolution);
      const resolutionBindings = canvas.dataset.boundUniforms;
      renderer.setMouse(1, 2);
      const time = await renderer.setFragmentShader(timeOnly);
      const timeBindings = canvas.dataset.boundUniforms;
      const all = await renderer.setFragmentShader(withAll);
      const allBindings = canvas.dataset.boundUniforms;
      const invalidModule = await renderer
        .setFragmentShader(
          "@fragment fn shdr_fragment_main() -> @location(0) vec4<f32> { return missing; }",
        )
        .then(
          () => "unexpected success",
          (error) => String(error),
        );
      const invalid = await renderer.setFragmentShader(badEntry).then(
        () => "unexpected success",
        (error) => String(error),
      );
      const preserved = {
        renderStatus: canvas.dataset.renderStatus,
        validationState: canvas.dataset.validationState,
        boundUniforms: canvas.dataset.boundUniforms,
      };
      return {
        initial,
        noBindings,
        resolution,
        resolutionBindings,
        time,
        timeBindings,
        all,
        allBindings,
        invalidModule,
        invalid,
        preserved,
      };
    },
    { red, withResolution, timeOnly, withAll, badEntry },
  );
  assert.deepEqual(setup.initial, []);
  assert.equal(setup.noBindings, "");
  assert.deepEqual(setup.resolution, ["resolution"]);
  assert.equal(setup.resolutionBindings, "resolution");
  assert.deepEqual(setup.time, ["time"]);
  assert.equal(setup.timeBindings, "time");
  assert.deepEqual(setup.all, ["resolution", "mouse", "time"]);
  assert.equal(setup.allBindings, "resolution,mouse,time");
  assert.match(setup.invalidModule, /module compilation failed/i);
  assert.match(setup.invalid, /pipeline creation failed/i);
  assert.deepEqual(setup.preserved, {
    renderStatus: "success",
    validationState: "error",
    boundUniforms: "resolution,mouse,time",
  });
  const preservedPixel = await readPresentedPixel(page);
  assert.ok(Math.abs(preservedPixel[0] - 32) <= 1, preservedPixel);
  assert.ok(Math.abs(preservedPixel[1] - 128) <= 1, preservedPixel);
  assert.equal(preservedPixel[3], 255);

  const latest = await page.evaluate(
    async ({ red, green }) => {
      const renderer = window.testWebGpuRenderer;
      const pending = renderer.setFragmentShader(red);
      const last = renderer.setFragmentShader(green);
      const [superseded, current] = await Promise.all([pending, last]);
      return {
        superseded,
        current,
        boundUniforms: document.querySelector("#webgpu").dataset.boundUniforms,
      };
    },
    { red, green },
  );
  assert.equal(latest.superseded, undefined);
  assert.deepEqual(latest.current, []);
  assert.equal(latest.boundUniforms, "");
  assert.deepEqual(await readPresentedPixel(page), [0, 255, 0, 255]);

  const lost = await page.evaluate(
    async ({ withAll, red }) => {
      window.testWebGpuDevice.destroy();
      await window.testWebGpuDevice.lost;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const canvas = document.querySelector("#webgpu");
      const state = {
        renderStatus: canvas.dataset.renderStatus,
        validationState: canvas.dataset.validationState,
      };
      let message = "unexpected success";
      try {
        await window.testWebGpuRenderer.setFragmentShader("unused");
      } catch (error) {
        message = String(error);
      }
      window.testWebGpuRenderer.dispose();
      window.testWebGpuRenderer.dispose();
      const { WebGpuRenderer } = await import("/src/webgpu-renderer.ts");
      const fresh = await WebGpuRenderer.create(canvas);
      const pending = fresh.setFragmentShader(withAll);
      fresh.dispose();
      const disposedPending = await pending;
      let disposedError;
      try {
        await fresh.setFragmentShader(red);
      } catch (error) {
        disposedError = String(error);
      }
      return {
        state,
        message,
        lostMessages: window.testLostMessages,
        disposedPending,
        disposedError,
      };
    },
    { withAll, red },
  );
  assert.deepEqual(lost.state, {
    renderStatus: "error",
    validationState: "error",
  });
  assert.match(lost.message, /device was lost/i);
  assert.equal(lost.lostMessages.length, 1);
  assert.match(lost.lostMessages[0], /WebGPU device lost/);
  assert.equal(lost.disposedPending, undefined);
  assert.match(lost.disposedError, /has been disposed/i);
  console.log(
    "WebGpuRenderer verified no/some/all bindings, pipeline failure, supersession, canvas pixel, device loss and disposal.",
  );
} finally {
  await browser?.close();
  await server.close();
}

async function readPresentedPixel(page) {
  // Screenshot the presented WebGPU canvas. A 2D context cannot share it;
  // decode its PNG into a separate 2D canvas to sample the displayed frame.
  const bytes = await page.locator("#webgpu").screenshot();
  return page.evaluate(
    async (png) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D readback context");
      ctx.drawImage(image, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    },
    [...bytes],
  );
}

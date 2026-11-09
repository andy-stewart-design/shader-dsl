import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { build, createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
function shader(body) {
  const result =
    compileFragmentArtifact(`import { createFragmentShader, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => { ${body} });`);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}
const red = shader("return vec4(1, 0, 0, 0.5);");
const green = shader("return vec4(0, 1, 0, 1);");
const coord = shader("return vec4(coord.x / 16, coord.y / 16, 0, 1);");
const defaults = shader(
  "return vec4(uniforms.mouse.x / uniforms.resolution.x, uniforms.mouse.y / uniforms.resolution.y, uniforms.time, 1);",
);
const time = shader("return vec4(uniforms.time / 2, 0, 0, 1);");
const vectorArithmetic = shader(
  "const rgb = vec3(vec2(0.2, 0.4), 0.6); return vec4((1 - rgb + 0.1).bgr, 1);",
);
const importedModuleConstants = compileFragmentArtifact({
  entry: "/work/entry.shdr.ts",
  files: {
    "/work/entry.shdr.ts": `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ coord }) =>
  vec4(scale(coord.x / 20), coord.y / 16, 0, 1),
);
`,
    "/work/helper.shdr.ts": `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const SCALE = 0.5;
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`,
  },
});
assert.equal(
  importedModuleConstants.ok,
  true,
  JSON.stringify(importedModuleConstants.diagnostics),
);
const moduleConstantsArtifact = importedModuleConstants.ok
  ? importedModuleConstants.artifact
  : undefined;
const uniformAliases =
  compileFragmentArtifact(`import { createFragmentShader, defineUniforms, vec4 } from "shdr";
const uniforms = defineUniforms((u) => ({ gain: u.f32(0.5) }));
export default createFragmentShader(($) => {
  const u = $.u;
  const other = u;
  return vec4(other.gain, $.uniforms.gain, $.u.gain, 1);
}, { uniforms });
`);
assert.equal(
  uniformAliases.ok,
  true,
  JSON.stringify(uniformAliases.diagnostics),
);
const uniformAliasesArtifact = uniformAliases.ok
  ? uniformAliases.artifact
  : undefined;
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
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const url = `http://127.0.0.1:${address.port}/`;
  await page.route(url, (route) =>
    route.fulfill({
      body: '<!doctype html><style>body {background:blue}</style><canvas id="gl" style="width:8px;height:8px"></canvas><canvas id="gpu" style="width:8px;height:8px"></canvas>',
    }),
  );
  await page.goto(url);
  const initial = await page.evaluate(async (artifact) => {
    const { WebGlRenderer, createWebGlRenderer } =
      await import("/src/webgl.ts");
    const { WebGpuRenderer, createWebGpuRenderer } =
      await import("/src/webgpu.ts");
    const { ShdrRuntimeError } = await import("/src/errors.ts");
    const glCanvas = document.querySelector("#gl");
    const gpuCanvas = document.querySelector("#gpu");
    const failures = [];
    window.failures = failures;
    const original = window.requestAnimationFrame;
    let frames = 0;
    window.requestAnimationFrame = (...args) => {
      frames++;
      return original(...args);
    };
    const adapterRequest = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (...args) => {
      const adapter = await adapterRequest(...args);
      if (!adapter) return adapter;
      return new Proxy(adapter, {
        get(target, prop) {
          if (prop === "requestDevice")
            return async (...args) => {
              const device = await target.requestDevice(...args);
              window.ownedDevice = device;
              return device;
            };
          return Reflect.get(target, prop, target);
        },
      });
    };
    const options = {
      animate: false,
      onError: (error) =>
        failures.push({ backend: error.backend, kind: error.kind }),
    };
    window.glRenderer = await WebGlRenderer.create(glCanvas, artifact, options);
    window.gpuRenderer = await WebGpuRenderer.create(
      gpuCanvas,
      artifact,
      options,
    );
    window.primaryDevice = window.ownedDevice;
    window.ShdrRuntimeError = ShdrRuntimeError;
    window.requestAnimationFrame = original;
    return {
      sharedFactories: [
        createWebGlRenderer === WebGlRenderer.create,
        createWebGpuRenderer === WebGpuRenderer.create,
      ],
      frames,
      size: [
        glCanvas.width,
        glCanvas.height,
        gpuCanvas.width,
        gpuCanvas.height,
      ],
      occupied: await createWebGlRenderer(glCanvas, artifact).then(
        () => "unexpected success",
        (e) => e.kind,
      ),
    };
  }, red);
  assert.deepEqual(initial, {
    sharedFactories: [true, true],
    frames: 0,
    size: [16, 16, 16, 16],
    occupied: "surface",
  });
  assert.deepEqual(await pixel(page, "gl"), [255, 0, 0, 255]);
  assert.deepEqual(await pixel(page, "gpu"), [255, 0, 0, 255]);

  const colorSpaces = await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const probeCanvas = document.createElement("canvas");
    const probe = probeCanvas.getContext("webgpu");
    let gpuP3Supported = false;
    if (probe) {
      try {
        probe.configure({
          device: window.primaryDevice,
          format: navigator.gpu.getPreferredCanvasFormat(),
          alphaMode: "opaque",
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
          colorSpace: "display-p3",
        });
        gpuP3Supported = probe.getConfiguration().colorSpace === "display-p3";
      } finally {
        probe.unconfigure();
      }
    }
    probeCanvas.remove();
    const glCanvas = document.createElement("canvas");
    const gpuCanvas = document.createElement("canvas");
    glCanvas.style.cssText = gpuCanvas.style.cssText = "width:8px;height:8px";
    document.body.append(glCanvas, gpuCanvas);
    const [gl, gpu] = await Promise.all([
      createWebGlRenderer(glCanvas, artifact, {
        animate: false,
        colorSpace: "display-p3",
      }),
      createWebGpuRenderer(gpuCanvas, artifact, {
        animate: false,
        colorSpace: "display-p3",
      }),
    ]);
    const glContext = glCanvas.getContext("webgl2");
    const gpuContext = gpuCanvas.getContext("webgpu");
    const initial = {
      gl: glContext?.drawingBufferColorSpace ?? "srgb",
      gpu: gpuContext.getConfiguration().colorSpace,
    };
    glCanvas.style.width = gpuCanvas.style.width = "10px";
    await Promise.all([gl.draw(), gpu.draw()]);
    const resized = {
      gl: glContext?.drawingBufferColorSpace ?? "srgb",
      gpu: gpuContext.getConfiguration().colorSpace,
    };
    gl.dispose();
    gpu.dispose();
    glCanvas.remove();
    gpuCanvas.remove();
    return { gpuP3Supported, initial, resized };
  }, red);
  assert.ok(["display-p3", "srgb"].includes(colorSpaces.initial.gl));
  assert.equal(colorSpaces.resized.gl, colorSpaces.initial.gl);
  const expectedGpuColorSpace = colorSpaces.gpuP3Supported
    ? "display-p3"
    : "srgb";
  assert.equal(colorSpaces.initial.gpu, expectedGpuColorSpace);
  assert.equal(colorSpaces.resized.gpu, expectedGpuColorSpace);

  const rejectedGpuColorSpace = await page.evaluate(async (artifact) => {
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:8px;height:8px";
    const nativeGetContext = canvas.getContext.bind(canvas);
    const target = nativeGetContext("webgpu");
    const calls = [];
    const context = new Proxy(target, {
      get(object, property) {
        if (property === "configure")
          return (configuration) => {
            calls.push(configuration.colorSpace ?? "default");
            if (configuration.colorSpace === "display-p3")
              throw new Error("test rejection");
            return object.configure(configuration);
          };
        const value = Reflect.get(object, property, object);
        return typeof value === "function" ? value.bind(object) : value;
      },
    });
    canvas.getContext = (kind, attributes) =>
      kind === "webgpu" ? context : nativeGetContext(kind, attributes);
    document.body.append(canvas);
    const renderer = await createWebGpuRenderer(canvas, artifact, {
      animate: false,
      colorSpace: "display-p3",
    });
    const initial = target.getConfiguration().colorSpace;
    canvas.style.width = "10px";
    await renderer.draw();
    const resized = target.getConfiguration().colorSpace;
    renderer.dispose();
    canvas.remove();
    return { calls, initial, resized };
  }, red);
  assert.deepEqual(rejectedGpuColorSpace.calls.slice(0, 2), [
    "display-p3",
    "srgb",
  ]);
  assert.equal(rejectedGpuColorSpace.initial, "srgb");
  assert.equal(rejectedGpuColorSpace.resized, "srgb");

  const rejectedWebGlColorSpace = await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:8px;height:8px";
    const nativeGetContext = canvas.getContext.bind(canvas);
    const target = nativeGetContext("webgl2");
    if (!("drawingBufferColorSpace" in target)) return null;
    const calls = [];
    const context = new Proxy(target, {
      get(object, property) {
        const value = Reflect.get(object, property, object);
        return typeof value === "function" ? value.bind(object) : value;
      },
      set(object, property, value) {
        if (property === "drawingBufferColorSpace") {
          calls.push(value);
          if (value === "display-p3") throw new Error("test rejection");
        }
        return Reflect.set(object, property, value, object);
      },
    });
    canvas.getContext = (kind, attributes) =>
      kind === "webgl2" ? context : nativeGetContext(kind, attributes);
    document.body.append(canvas);
    const renderer = await createWebGlRenderer(canvas, artifact, {
      animate: false,
      colorSpace: "display-p3",
    });
    const initial = target.drawingBufferColorSpace;
    canvas.style.width = "10px";
    await renderer.draw();
    const resized = target.drawingBufferColorSpace;
    renderer.dispose();
    canvas.remove();
    return { calls, initial, resized };
  }, red);
  if (rejectedWebGlColorSpace) {
    assert.deepEqual(rejectedWebGlColorSpace.calls.slice(0, 2), [
      "display-p3",
      "srgb",
    ]);
    assert.equal(rejectedWebGlColorSpace.initial, "srgb");
    assert.equal(rejectedWebGlColorSpace.resized, "srgb");
  }

  const initiallyPaused = await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const glCanvas = document.createElement("canvas");
    const gpuCanvas = document.createElement("canvas");
    glCanvas.id = "initially-paused-gl";
    gpuCanvas.id = "initially-paused-gpu";
    glCanvas.style.cssText = gpuCanvas.style.cssText = "width:8px;height:8px";
    document.body.append(glCanvas, gpuCanvas);
    const original = window.requestAnimationFrame;
    let frames = 0;
    window.requestAnimationFrame = (...args) => {
      frames++;
      return original(...args);
    };
    const [gl, gpu] = await Promise.all([
      createWebGlRenderer(glCanvas, artifact, { playing: false }),
      createWebGpuRenderer(gpuCanvas, artifact, { playing: false }),
    ]);
    window.requestAnimationFrame = original;
    await Promise.all([gl.draw(), gpu.draw()]);
    const context = glCanvas.getContext("webgl2");
    const value = new Uint8Array(4);
    context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, value);
    window.initiallyPaused = { gl, gpu };
    return { frames, pixel: value[0] };
  }, red);
  assert.deepEqual(initiallyPaused.frames, 0);
  const initiallyPausedGpu = (await pixel(page, "initially-paused-gpu"))[0];
  await page.waitForTimeout(120);
  const initiallyPausedAfter = await page.evaluate(async () => {
    await Promise.all([
      window.initiallyPaused.gl.draw(),
      window.initiallyPaused.gpu.draw(),
    ]);
    const canvas = document.querySelector("#initially-paused-gl");
    const gl = canvas.getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return value[0];
  });
  assert.equal(initiallyPausedAfter, initiallyPaused.pixel);
  assert.equal(
    (await pixel(page, "initially-paused-gpu"))[0],
    initiallyPausedGpu,
  );
  await page.evaluate(() => {
    window.initiallyPaused.gl.dispose();
    window.initiallyPaused.gpu.dispose();
  });

  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, vectorArithmetic);
  for (const backend of ["gl", "gpu"]) {
    const actual = await pixel(page, backend);
    for (const [index, expected] of [128, 179, 230, 255].entries()) {
      assert.ok(
        Math.abs(actual[index] - expected) <= 2,
        `${backend} color swizzle/constructor/vector arithmetic channel ${index}: ${actual}`,
      );
    }
  }

  await page.evaluate(async (artifact) => {
    for (const canvas of [
      document.querySelector("#gl"),
      document.querySelector("#gpu"),
    ]) {
      canvas.style.width = "10px";
      canvas.style.height = "8px";
    }
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  }, moduleConstantsArtifact);
  const moduleCenterGl = await pixelAt(page, "gl", 10, 8);
  const moduleCenterGpu = await pixelAt(page, "gpu", 10, 8);
  const moduleLeftGl = await pixelAt(page, "gl", 0, 8);
  const moduleLeftGpu = await pixelAt(page, "gpu", 0, 8);
  for (const [name, actual] of [
    ["module WebGL center", moduleCenterGl],
    ["module WebGPU center", moduleCenterGpu],
  ]) {
    assertChannel(name + " red", actual[0], 64, 6);
    assertChannel(name + " green", actual[1], 136, 4);
    assertChannel(name + " blue", actual[2], 0, 2);
  }
  for (const [name, actual] of [
    ["module WebGL left", moduleLeftGl],
    ["module WebGPU left", moduleLeftGpu],
  ]) {
    assertChannel(name + " red", actual[0], 3, 4);
    assertChannel(name + " green", actual[1], 136, 4);
    assertChannel(name + " blue", actual[2], 0, 2);
  }
  assert.deepEqual(moduleCenterGl, moduleCenterGpu);
  assert.deepEqual(moduleLeftGl, moduleLeftGpu);
  await page.evaluate(async (artifact) => {
    for (const canvas of [
      document.querySelector("#gl"),
      document.querySelector("#gpu"),
    ]) {
      canvas.style.width = "8px";
      canvas.style.height = "8px";
    }
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  }, uniformAliasesArtifact);
  for (const backend of ["gl", "gpu"]) {
    const actual = await pixel(page, backend);
    for (const [index, expected] of [128, 128, 128, 255].entries())
      assertChannel(
        `${backend} uniform alias channel ${index}`,
        actual[index],
        expected,
        3,
      );
  }

  const bindings = await page.evaluate(
    async ({ coord, defaults, time }) => {
      const gl = window.glRenderer,
        gpu = window.gpuRenderer;
      const implicit = await Promise.all([
        gl.setShader(coord),
        gpu.setShader(coord),
      ]);
      const tracked = await Promise.all([
        gl.setShader(defaults),
        gpu.setShader(defaults),
      ]);
      gl.setPointerNormalized(0.25, 0.75);
      gpu.setPointerNormalized(0.25, 0.75);
      await Promise.all([gl.draw(), gpu.draw()]);
      const pixels = {
        gl: [
          ...(() => {
            const c = document.querySelector("#gl");
            const a = new Uint8Array(4);
            c.getContext("webgl2").readPixels(8, 8, 1, 1, 6408, 5121, a);
            return a;
          })(),
        ],
      };
      document.querySelector("#gl").style.width = "10px";
      document.querySelector("#gpu").style.width = "10px";
      await Promise.all([gl.draw(), gpu.draw()]);
      const resized = [
        document.querySelector("#gl").width,
        document.querySelector("#gpu").width,
      ];
      const reset = await Promise.all([
        gl.setShader(time),
        gpu.setShader(time),
      ]);
      const canvasDataAttributes = ["gl", "gpu"].map((id) =>
        [...document.querySelector(`#${id}`).attributes]
          .filter((attribute) => attribute.name.startsWith("data-"))
          .map((attribute) => attribute.name),
      );
      return {
        implicit,
        tracked,
        pixels,
        resized,
        reset,
        canvasDataAttributes,
      };
    },
    { coord, defaults, time },
  );
  assert.deepEqual(
    bindings.implicit.map((item) => item.boundUniforms),
    [["resolution"], []],
  );
  assert.deepEqual(
    bindings.tracked.map((item) => item.boundUniforms),
    [
      ["resolution", "mouse", "time"],
      ["resolution", "mouse", "time"],
    ],
  );
  assert.ok(Math.abs(bindings.pixels.gl[0] - 64) <= 1, bindings.pixels.gl);
  assert.ok(Math.abs(bindings.pixels.gl[1] - 191) <= 1, bindings.pixels.gl);
  assert.deepEqual(bindings.resized, [20, 20]);
  assert.deepEqual(bindings.canvasDataAttributes, [[], []]);
  assert.deepEqual(
    bindings.reset.map((item) => item.status),
    ["installed", "installed"],
  );
  assert.ok((await pixel(page, "gl"))[0] < 35);
  assert.ok((await pixel(page, "gpu"))[0] < 35);
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  });
  const beforeFailureGl = (await pixel(page, "gl"))[0];
  const beforeFailureGpu = (await pixel(page, "gpu"))[0];
  assert.ok(beforeFailureGl > 25);
  assert.ok(beforeFailureGpu > 25);
  await page.evaluate(async (artifact) => {
    const badGl = { ...artifact, glsl: "not valid GLSL" };
    const badGpu = { ...artifact, wgsl: "not valid WGSL" };
    await Promise.all([
      window.glRenderer.setShader(badGl).catch(() => undefined),
      window.gpuRenderer.setShader(badGpu).catch(() => undefined),
    ]);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
  }, red);
  assert.ok((await pixel(page, "gl"))[0] >= beforeFailureGl);
  assert.ok((await pixel(page, "gpu"))[0] >= beforeFailureGpu);

  const failures = await page.evaluate(
    async ({ green, red, defaults }) => {
      const gl = window.glRenderer,
        gpu = window.gpuRenderer;
      await Promise.all([gl.setShader(green), gpu.setShader(green)]);
      const badGl = {
        ...red,
        glsl: red.glsl.replace("shdr_fragment_color", "missing_color"),
      };
      const badGpu = {
        ...red,
        wgsl: red.wgsl.replace("shdr_fragment_main", "missing_main"),
      };
      const broken = await Promise.all([
        gl.setShader(badGl).then(
          () => "unexpected",
          (e) => e.kind,
        ),
        gpu.setShader(badGpu).then(
          () => "unexpected",
          (e) => e.kind,
        ),
      ]);
      const malformed = await gpu
        .setShader({
          ...red,
          defaults: { ...red.defaults, wgsl: ["mouse", "mouse"] },
        })
        .then(
          () => "unexpected",
          (e) => e.kind,
        );
      const mismatched = await gpu
        .setShader({
          ...defaults,
          defaults: { ...defaults.defaults, wgsl: [] },
        })
        .then(
          () => "unexpected",
          (e) => e.kind,
        );
      const first = gpu.setShader(red);
      const last = gpu.setShader(green);
      const [superseded, installed] = await Promise.all([first, last]);
      return { broken, malformed, mismatched, superseded, installed };
    },
    { green, red, defaults },
  );
  assert.deepEqual(failures.broken, ["shader", "shader"]);
  assert.equal(failures.malformed, "artifact");
  assert.notEqual(failures.mismatched, "unexpected");
  assert.equal(failures.superseded.status, "superseded");
  assert.equal(failures.installed.status, "installed");
  assert.deepEqual(await pixel(page, "gl"), [0, 255, 0, 255]);
  assert.deepEqual(await pixel(page, "gpu"), [0, 255, 0, 255]);

  // A WebGPU candidate can already be visible while its validation scope is
  // pending. A superseding install followed by a failed replacement must
  // restore the last valid frame, rather than leaving the stale candidate.
  await page.evaluate(async (time) => {
    const gpu = window.gpuRenderer;
    gpu.setPlaying(true);
    await gpu.setShader(time, { startedAt: performance.now() - 20_000 });
    await gpu.draw();
    gpu.setPlaying(false);
  }, time);
  const beforeTransactional = (await pixel(page, "gpu"))[0];
  const transactional = await page.evaluate(
    async ({ green, red }) => {
      const gpu = window.gpuRenderer;
      const device = window.primaryDevice;
      const originalPop = device.popErrorScope.bind(device);
      let pops = 0;
      let release;
      device.popErrorScope = (...args) => {
        pops++;
        if (pops === 5)
          return new Promise((resolve) => {
            release = () => resolve(originalPop(...args));
          });
        return originalPop(...args);
      };
      const superseded = gpu.setShader(green);
      while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
      const failed = gpu.setShader({
        ...red,
        wgsl: red.wgsl.replace("shdr_fragment_main", "missing_main"),
      });
      release();
      const result = await Promise.all([
        superseded,
        failed.then(
          () => "unexpected",
          (error) => error.kind,
        ),
      ]);
      device.popErrorScope = originalPop;
      return result;
    },
    { green, red },
  );
  assert.deepEqual(transactional, [{ status: "superseded" }, "shader"]);
  assert.equal((await pixel(page, "gpu"))[0], beforeTransactional);

  // Canvas pointer listeners work without the REPL's optional coordination hook.
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, defaults);
  for (const [selector, backend] of [
    ["#gl", "gl"],
    ["#gpu", "gpu"],
  ]) {
    const box = await page.locator(selector).boundingBox();
    await page.mouse.move(box.x + 2.5, box.y + 6);
    await page.evaluate(async (target) => {
      await (target === "gl" ? window.glRenderer : window.gpuRenderer).draw();
    }, backend);
    const sample = await pixel(page, backend);
    assert.ok(Math.abs(sample[0] - 64) <= 2, `${backend} pointer X: ${sample}`);
    assert.ok(
      Math.abs(sample[1] - 191) <= 2,
      `${backend} pointer Y: ${sample}`,
    );
  }

  // Playing is independent from the RAF switch. A successful replacement
  // while paused starts at zero, stays frozen, and resumes from zero. The
  // time-encoded shader makes the reset observable instead of a flat color.
  const pausedStartGl = await page.evaluate(async (artifact) => {
    window.glRenderer.setPlaying(true);
    window.gpuRenderer.setPlaying(true);
    const oldOrigin = performance.now() - 20_000;
    await Promise.all([
      window.glRenderer.setShader(artifact, { startedAt: oldOrigin }),
      window.gpuRenderer.setShader(artifact, { startedAt: oldOrigin }),
    ]);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    window.glRenderer.setPlaying(false);
    window.gpuRenderer.setPlaying(false);
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    const canvas = document.querySelector("#gl");
    const gl = canvas.getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return value[0];
  }, time);
  const pausedStartGpu = (await pixel(page, "gpu"))[0];
  assert.ok(pausedStartGl <= 2, pausedStartGl);
  assert.ok(pausedStartGpu <= 2, pausedStartGpu);
  await page.waitForTimeout(120);
  const pausedEndGl = await page.evaluate(async () => {
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    const canvas = document.querySelector("#gl");
    const gl = canvas.getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return value[0];
  });
  const pausedEndGpu = (await pixel(page, "gpu"))[0];
  assert.equal(pausedEndGl, pausedStartGl);
  assert.equal(pausedEndGpu, pausedStartGpu);
  const resumedGl = await page.evaluate(async () => {
    window.glRenderer.setPlaying(true);
    window.gpuRenderer.setPlaying(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    const canvas = document.querySelector("#gl");
    const gl = canvas.getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return value[0];
  });
  const resumedGpu = (await pixel(page, "gpu"))[0];
  assert.ok(resumedGl > pausedEndGl, [resumedGl, pausedEndGl]);
  assert.ok(resumedGpu > pausedEndGpu, [resumedGpu, pausedEndGpu]);
  await page.waitForTimeout(100);
  const frozenGl = await page.evaluate(async () => {
    window.glRenderer.setPlaying(false);
    window.gpuRenderer.setPlaying(false);
    await Promise.all([window.glRenderer.draw(), window.gpuRenderer.draw()]);
    const canvas = document.querySelector("#gl");
    const gl = canvas.getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return value[0];
  });
  const frozenGpu = (await pixel(page, "gpu"))[0];
  assert.equal(frozenGl, resumedGl);
  assert.equal(frozenGpu, resumedGpu);

  // The default loop runs on its own; disposal stops it. Manual renderers above
  // never scheduled a frame, including on pointer and size changes.
  const automatic = await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const canvases = ["animated-gl", "animated-gpu"].map((id) => {
      const canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.style.cssText = "width:8px;height:8px";
      document.body.append(canvas);
      return canvas;
    });
    window.frameErrors = [];
    window.automatic = await Promise.all([
      createWebGlRenderer(canvases[0], artifact, {
        onError(error) {
          window.frameErrors.push(error.kind);
          throw new Error("Host callback exception must not escape RAF.");
        },
      }),
      createWebGpuRenderer(canvases[1], artifact),
    ]);
    return [canvases[0].width, canvases[1].width];
  }, time);
  assert.deepEqual(automatic, [16, 16]);
  await page.waitForTimeout(200);
  const animatedRed = await page.evaluate(() => {
    const gl = document.querySelector("#animated-gl").getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return value[0];
  });
  assert.ok(animatedRed > 25, animatedRed);
  assert.ok((await pixel(page, "animated-gpu"))[0] > 25);
  await page.evaluate(() => {
    const gl = document.querySelector("#animated-gl").getContext("webgl2");
    window.getError = gl.getError.bind(gl);
    gl.getError = () => gl.INVALID_OPERATION;
  });
  await page.waitForFunction(() => window.frameErrors.length === 1);
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => window.frameErrors), ["draw"]);
  await page.evaluate(async (artifact) => {
    const gl = document.querySelector("#animated-gl").getContext("webgl2");
    gl.getError = window.getError;
    await window.automatic[0].setShader(artifact); // Successful replacement restarts RAF.
    for (const renderer of window.automatic) renderer.dispose();
  }, time);

  const abortResult = await page.evaluate(async (artifact) => {
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:8px;height:8px";
    document.body.append(canvas);
    const actual = navigator.gpu.requestAdapter.bind(navigator.gpu);
    let release;
    navigator.gpu.requestAdapter = () =>
      new Promise((resolve) => {
        release = async () => resolve(await actual());
      });
    const controller = new AbortController();
    const pending = createWebGpuRenderer(canvas, artifact, {
      signal: controller.signal,
    });
    controller.abort();
    await release();
    const aborted = await pending.then(
      () => "unexpected",
      (e) => e.kind,
    );
    navigator.gpu.requestAdapter = actual;
    const renderer = await createWebGpuRenderer(canvas, artifact, {
      animate: false,
    });
    const queued = renderer.setShader(artifact);
    renderer.dispose();
    const disposedPending = await queued;
    const disposedDraw = await renderer.draw().then(
      () => "unexpected",
      (e) => e.kind,
    );
    return { aborted, disposedPending, disposedDraw };
  }, red);
  assert.deepEqual(abortResult, {
    aborted: "aborted",
    disposedPending: { status: "superseded" },
    disposedDraw: "disposed",
  });

  const terminal = await page.evaluate(async () => {
    const canvas = document.querySelector("#gl");
    canvas
      .getContext("webgl2")
      .getExtension("WEBGL_lose_context")
      .loseContext();
    window.primaryDevice.destroy();
    await window.primaryDevice.lost;
    await new Promise((r) => setTimeout(r, 0));
    const errors = await Promise.all([
      window.glRenderer.draw().then(
        () => "unexpected",
        (e) => e.kind,
      ),
      window.gpuRenderer.draw().then(
        () => "unexpected",
        (e) => e.kind,
      ),
      Promise.resolve()
        .then(() => window.glRenderer.setUniforms({}))
        .then(
          () => "unexpected",
          (e) => e.kind,
        ),
      Promise.resolve()
        .then(() => window.gpuRenderer.resetUniforms())
        .then(
          () => "unexpected",
          (e) => e.kind,
        ),
    ]);
    window.glRenderer.dispose();
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
    window.gpuRenderer.dispose();
    return { errors, failures: window.failures };
  });
  assert.deepEqual(terminal.errors, ["lost", "lost", "lost", "lost"]);
  assert.deepEqual(terminal.failures, [
    { backend: "webgl", kind: "lost" },
    { backend: "webgpu", kind: "lost" },
  ]);
  assert.deepEqual(pageErrors, []);
  const missing = await browser.newPage();
  await missing.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    }),
  );
  await missing.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><canvas id="gpu"></canvas>',
    }),
  );
  await missing.goto(url);
  const unavailable = await missing.evaluate(async (artifact) => {
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    return createWebGpuRenderer(
      document.querySelector("canvas"),
      artifact,
    ).then(
      () => "unexpected",
      (e) => ({ kind: e.kind, message: String(e), name: e.name }),
    );
  }, red);
  assert.equal(unavailable.kind, "unavailable", JSON.stringify(unavailable));
  const noAdapter = await page.evaluate(async (artifact) => {
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const original = navigator.gpu.requestAdapter;
    navigator.gpu.requestAdapter = async () => null;
    try {
      return await createWebGpuRenderer(
        document.createElement("canvas"),
        artifact,
      ).then(
        () => "unexpected",
        (e) => e.kind,
      );
    } finally {
      navigator.gpu.requestAdapter = original;
    }
  }, red);
  assert.equal(noAdapter, "unavailable");
  await auditBundles();
  console.log(
    "Verified owned WebGL/WebGPU first frames, Display-P3/sRGB fallback and resize preservation, vector arithmetic/color swizzles, opaque alpha, bindings, manual inputs, playing pause/resume, failed/stale installs, loss, disposal and isolated bundles.",
  );
} finally {
  await browser?.close();
  await server.close();
}

function assertChannel(label, actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual}, expected ${expected} ± ${tolerance}`,
  );
}

async function pixel(page, id) {
  return pixelAt(page, id, 0, 0);
}

async function pixelAt(page, id, x, y) {
  if (id === "gl")
    return page.evaluate(
      ({ x, y }) => {
        const canvas = document.querySelector("#gl"),
          gl = canvas.getContext("webgl2");
        const value = new Uint8Array(4);
        gl.finish();
        gl.readPixels(
          x,
          canvas.height - 1 - y,
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          value,
        );
        return [...value];
      },
      { x, y },
    );
  const bytes = await page.locator(`#${id}`).screenshot();
  return page.evaluate(
    async ({ png, x, y }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [...context.getImageData(x, y, 1, 1).data];
    },
    { png: [...bytes], x, y },
  );
}
async function auditBundles() {
  const directory = await mkdtemp(join(tmpdir(), "shdr-runtime-"));
  try {
    for (const backend of ["webgl", "webgpu"]) {
      await build({
        root,
        configFile: false,
        logLevel: "silent",
        build: {
          lib: {
            entry: join(root, "src", `${backend}.ts`),
            formats: ["es"],
            fileName: "renderer",
          },
          outDir: join(directory, backend),
          sourcemap: true,
          emptyOutDir: true,
        },
      });
      const output = join(directory, backend);
      const files = await readdir(output);
      const code = (
        await Promise.all(
          files
            .filter((f) => f.endsWith(".js"))
            .map((f) => readFile(join(output, f), "utf8")),
        )
      ).join("\n");
      const sources = (
        await Promise.all(
          files
            .filter((f) => f.endsWith(".map"))
            .map(
              async (f) =>
                JSON.parse(await readFile(join(output, f), "utf8")).sources,
            ),
        )
      ).flat();
      assert.ok(
        sources.some((s) => s.endsWith(`/src/${backend}.ts`)),
        sources,
      );
      assert.ok(
        !sources.some((s) =>
          s.endsWith(`/src/${backend === "webgl" ? "webgpu" : "webgl"}.ts`),
        ),
        sources,
      );
      assert.ok(
        !sources.some((s) => /@babel[+/]parser|packages\/core\//.test(s)),
        sources,
      );
      assert.ok(!code.includes("createFragmentShader"));
      console.log(
        `${backend} isolated renderer: ${Buffer.byteLength(code)} B minified, ${gzipSync(code).length} B gzip`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

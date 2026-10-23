import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

const references = [
  ["circles-circling", {}],
  ["infinite-squircle", {}],
  ["moby-gradient", {}],
  ["scream-wave", { intensity: 1, waveSpeed: 1 }],
  ["ben-day-spotlight", { dpi: 8, spread: 0.32, blur: 0.08 }],
];

// Times are seconds and mouse coordinates are top-left host pixels. These
// scenarios intentionally cover time, aspect ratio, pointer input, and custom
// uniform overrides instead of relying on one square smoke-test frame.
const scenarios = [
  { name: "circles-circling", width: 48, height: 48, time: 0, mouse: [12, 36] },
  {
    name: "circles-circling",
    width: 61,
    height: 37,
    time: 2.4,
    mouse: [49, 8],
  },
  { name: "infinite-squircle", width: 53, height: 41, time: 0, mouse: [4, 30] },
  {
    name: "infinite-squircle",
    width: 62,
    height: 34,
    time: 2.75,
    mouse: [46, 7],
  },
  { name: "moby-gradient", width: 48, height: 48, time: 0, mouse: [12, 36] },
  {
    name: "moby-gradient",
    width: 67,
    height: 39,
    time: 1.35,
    mouse: [58, 5],
  },
  {
    name: "scream-wave",
    width: 48,
    height: 48,
    time: 0,
    mouse: [12, 36],
    values: { intensity: 1, waveSpeed: 1 },
  },
  // phase = 4.0 / 7 ~= .571: high emotion, including chromatic
  // separation, jitter, scanlines, glitching, and both noise layers.
  {
    name: "scream-wave",
    width: 63,
    height: 37,
    time: 4.0,
    mouse: [51, 6],
    values: { intensity: 0.92, waveSpeed: 1.35 },
  },
  {
    name: "ben-day-spotlight",
    width: 48,
    height: 48,
    time: 0,
    mouse: [12, 36],
    values: { dpi: 8, spread: 0.32, blur: 0.08 },
  },
  {
    name: "ben-day-spotlight",
    width: 59,
    height: 35,
    time: 2.2,
    mouse: [45, 11],
    values: { dpi: 5.5, spread: 0.58, blur: 0.14 },
  },
];
assert.equal(scenarios.length, 10);

function replaceExactly(name, source, needle, replacement, count) {
  const actual = source.split(needle).length - 1;
  assert.equal(
    actual,
    count,
    `${name}: expected ${count} baseline replacement(s), found ${actual}`,
  );
  return source.replaceAll(needle, replacement);
}

function normalizeUndefinedSmoothsteps(name, source) {
  if (name === "circles-circling")
    return replaceExactly(
      name,
      source,
      "smoothstep(2.0, 1.0, abs((wrapped - 3.0)))",
      "(1.0 - smoothstep(1.0, 2.0, abs((wrapped - 3.0))))",
      1,
    );
  if (name === "moby-gradient")
    return replaceExactly(
      name,
      source,
      "smoothstep(0.5, -0.3, warpedUv.y)",
      "(1.0 - smoothstep(-0.3, 0.5, warpedUv.y))",
      1,
    );
  if (name === "scream-wave") {
    let normalized = replaceExactly(
      name,
      source,
      "smoothstep(thickness, 0.0, distR)",
      "(1.0 - smoothstep(0.0, thickness, distR))",
      1,
    );
    normalized = replaceExactly(
      name,
      normalized,
      "smoothstep(thickness, 0.0, distG)",
      "(1.0 - smoothstep(0.0, thickness, distG))",
      1,
    );
    return replaceExactly(
      name,
      normalized,
      "smoothstep(thickness, 0.0, distB)",
      "(1.0 - smoothstep(0.0, thickness, distB))",
      1,
    );
  }
  return source;
}

function compile(name, source) {
  const result = compileFragmentArtifact(source);
  assert.equal(
    result.ok,
    true,
    `${name}: ${JSON.stringify(result.diagnostics)}`,
  );
  return result.artifact;
}

const cases = [];
for (const [name, defaults] of references) {
  const authored = await readFile(
    new URL(
      `../../../apps/vite-basic/src/references/${name}.shdr.ts`,
      import.meta.url,
    ),
    "utf8",
  );
  const original = await readFile(
    new URL(
      `../../../apps/vite-basic/src/references/${name}.frag`,
      import.meta.url,
    ),
    "utf8",
  );
  cases.push({
    name,
    defaults,
    artifact: compile(name, authored),
    original: normalizeUndefinedSmoothsteps(name, original),
  });
}
const caseByName = new Map(cases.map((item) => [item.name, item]));
for (const scenario of scenarios) {
  const item = caseByName.get(scenario.name);
  assert.ok(item, `Missing compiled reference ${scenario.name}`);
  scenario.values ??= item.defaults;
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
    throw Error("Vite server unavailable");
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `http://127.0.0.1:${address.port}/`;
  await page.route(`${url}*`, (route) => {
    if (!["/", "/index.html"].includes(new URL(route.request().url()).pathname))
      return route.continue();
    return route.fulfill({
      contentType: "text/html",
      body: '<canvas id="raw" width="48" height="48"></canvas><canvas id="gl" width="48" height="48"></canvas><canvas id="gpu" width="48" height="48"></canvas>',
    });
  });
  const clockOrigin = 100_000;
  await page.addInitScript((origin) => {
    let currentTime = origin;
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => currentTime,
    });
    Object.defineProperty(window, "setReferenceTime", {
      configurable: true,
      value: (time) => {
        currentTime = time;
      },
    });
  }, clockOrigin);
  await page.goto(`${url}index.html`);

  for (const scenario of scenarios) {
    const item = caseByName.get(scenario.name);
    await page.evaluate(
      async ({ item, scenario, clockOrigin }) => {
        window.setReferenceTime(clockOrigin + scenario.time * 1000);
        window.currentRenderers?.glRenderer.dispose();
        window.currentRenderers?.gpuRenderer.dispose();
        for (const id of ["raw", "gl", "gpu"]) {
          const canvas = document.querySelector(`#${id}`);
          canvas.width = scenario.width;
          canvas.height = scenario.height;
        }
        const compile = (gl, kind, code) => {
          const shader = gl.createShader(kind);
          gl.shaderSource(shader, code);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(shader));
          return shader;
        };
        const rawCanvas = document.querySelector("#raw");
        const rawGl = rawCanvas.getContext("webgl2", {
          alpha: false,
          preserveDrawingBuffer: true,
        });
        const vertex = compile(
          rawGl,
          rawGl.VERTEX_SHADER,
          "#version 300 es\nvoid main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }",
        );
        const fragment = compile(rawGl, rawGl.FRAGMENT_SHADER, item.original);
        const program = rawGl.createProgram();
        rawGl.attachShader(program, vertex);
        rawGl.attachShader(program, fragment);
        rawGl.linkProgram(program);
        if (!rawGl.getProgramParameter(program, rawGl.LINK_STATUS))
          throw Error(rawGl.getProgramInfoLog(program));
        rawGl.useProgram(program);
        rawGl.uniform2f(
          rawGl.getUniformLocation(program, "u_resolution"),
          scenario.width,
          scenario.height,
        );
        rawGl.uniform1f(
          rawGl.getUniformLocation(program, "u_time"),
          scenario.time,
        );
        rawGl.uniform2f(
          rawGl.getUniformLocation(program, "u_mouse"),
          scenario.mouse[0],
          scenario.height - scenario.mouse[1],
        );
        for (const [name, value] of Object.entries(scenario.values)) {
          const location = rawGl.getUniformLocation(program, `u_${name}`);
          if (Array.isArray(value)) rawGl.uniform3fv(location, value);
          else rawGl.uniform1f(location, value);
        }
        rawGl.viewport(0, 0, scenario.width, scenario.height);

        // Keep setup, renderer draws, and both baseline draws on one fixed
        // performance clock. Every target therefore receives exactly scenario.time.
        const { createWebGlRenderer } = await import("/src/webgl.ts");
        const { createWebGpuRenderer } = await import("/src/webgpu.ts");
        const glRenderer = await createWebGlRenderer(
          document.querySelector("#gl"),
          item.artifact,
          { animate: false, startedAt: clockOrigin },
        );
        const gpuRenderer = await createWebGpuRenderer(
          document.querySelector("#gpu"),
          item.artifact,
          { animate: false, startedAt: clockOrigin },
        );
        for (const renderer of [glRenderer, gpuRenderer]) {
          renderer.setPointerNormalized(
            scenario.mouse[0] / scenario.width,
            scenario.mouse[1] / scenario.height,
          );
          if (Object.keys(scenario.values).length)
            renderer.setUniforms(scenario.values);
        }
        const readFrame = (context) => {
          const pixels = new Uint8Array(scenario.width * scenario.height * 4);
          context.readPixels(
            0,
            0,
            scenario.width,
            scenario.height,
            context.RGBA,
            context.UNSIGNED_BYTE,
            pixels,
          );
          const frame = new Array(pixels.length);
          for (let y = 0; y < scenario.height; y++)
            for (let x = 0; x < scenario.width * 4; x++)
              frame[y * scenario.width * 4 + x] =
                pixels[(scenario.height - y - 1) * scenario.width * 4 + x];
          return frame;
        };
        await glRenderer.draw();
        rawGl.uniform1f(
          rawGl.getUniformLocation(program, "u_time"),
          scenario.time,
        );
        rawGl.drawArrays(rawGl.TRIANGLES, 0, 3);
        rawGl.finish();
        const rawForGl = readFrame(rawGl);
        rawGl.uniform1f(
          rawGl.getUniformLocation(program, "u_time"),
          scenario.time,
        );
        rawGl.drawArrays(rawGl.TRIANGLES, 0, 3);
        rawGl.finish();
        const rawForGpu = readFrame(rawGl);
        await gpuRenderer.draw();
        window.referenceFrames = { rawForGl, rawForGpu };
        window.currentRenderers = { glRenderer, gpuRenderer };
      },
      { item, scenario, clockOrigin },
    );

    const frames = await page.evaluate(
      ({ width, height }) => {
        const context = document.querySelector("#gl").getContext("webgl2");
        context.finish();
        const pixels = new Uint8Array(width * height * 4);
        context.readPixels(
          0,
          0,
          width,
          height,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixels,
        );
        const gl = new Array(pixels.length);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width * 4; x++)
            gl[y * width * 4 + x] = pixels[(height - y - 1) * width * 4 + x];
        return {
          raw: window.referenceFrames.rawForGl,
          rawGpu: window.referenceFrames.rawForGpu,
          gl,
        };
      },
      { width: scenario.width, height: scenario.height },
    );
    const raw = frames.raw;
    const rawGpu = frames.rawGpu;
    const gl = frames.gl;
    const png = await page.locator("#gpu").screenshot();
    const gpu = await page.evaluate(
      async ({ bytes, width, height }) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        if (image.width !== width || image.height !== height)
          throw Error(
            `Unexpected screenshot size ${image.width}x${image.height}`,
          );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return [...context.getImageData(0, 0, width, height).data];
      },
      { bytes: [...png], width: scenario.width, height: scenario.height },
    );

    for (const [label, frame] of [
      ["GLSL", raw],
      ["WebGL", gl],
      ["WebGPU", gpu],
    ]) {
      assert.equal(frame.length, scenario.width * scenario.height * 4);
      assert.ok(
        frame.every(Number.isFinite),
        `${item.name}: ${label} has finite pixels`,
      );
      // The raw and WebGL contexts use alpha:false, whose default-framebuffer
      // alpha readback is implementation-defined. Presented WebGPU is opaque.
      if (label === "WebGPU")
        assert.ok(
          frame.every(
            (_, channel) => channel % 4 !== 3 || frame[channel] === 255,
          ),
          `${item.name}: WebGPU frame is opaque`,
        );
    }
    const glStats = compareFrames(raw, gl);
    const gpuStats = compareFrames(rawGpu, gpu);
    assert.ok(
      rawGpu.every(Number.isFinite),
      `${item.name}: GLSL WebGPU-time baseline has finite pixels`,
    );
    assertNontrivialRgb(item.name, "GLSL", raw);
    assertNontrivialRgb(item.name, "GLSL WebGPU-time", rawGpu);
    // 8-bit RGB-channel limits cover any target translation or presentation
    // rounding; timing differences are not included in the budget.
    const tolerance = {
      gl: { mean: 0.5, p95: 1, p99: 2, max: 4 },
      gpu: { mean: 0.5, p95: 1, p99: 2, max: 4 },
    };
    assertStats(item.name, "WebGL", glStats, tolerance.gl);
    assertStats(item.name, "WebGPU", gpuStats, tolerance.gpu);
    console.log(
      `Verified ${item.name} ${scenario.width}x${scenario.height} t=${scenario.time} mouse=${scenario.mouse.join(",")} WebGL ${formatStats(glStats)} WebGPU ${formatStats(gpuStats)}`,
    );
  }
  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.currentRenderers?.glRenderer.dispose();
    window.currentRenderers?.gpuRenderer.dispose();
  });
} finally {
  await browser?.close();
  await server.close();
}

function assertNontrivialRgb(name, label, frame) {
  const colors = new Set();
  let hasNonblack = false;
  for (let index = 0; index < frame.length; index += 4) {
    const color = `${frame[index]},${frame[index + 1]},${frame[index + 2]}`;
    colors.add(color);
    hasNonblack ||=
      frame[index] !== 0 || frame[index + 1] !== 0 || frame[index + 2] !== 0;
  }
  assert.ok(hasNonblack, `${name}: ${label} baseline has nonblack RGB pixels`);
  assert.ok(
    colors.size > 1,
    `${name}: ${label} baseline has distinct RGB pixels`,
  );
}

function compareFrames(reference, candidate) {
  // One error value per pixel: average absolute RGB-channel error in 8-bit
  // units. This prevents one saturated channel from hiding the frame's error
  // distribution while still retaining a useful worst-pixel maximum.
  const errors = [];
  for (let index = 0; index < reference.length; index += 4)
    errors.push(
      (Math.abs(reference[index] - candidate[index]) +
        Math.abs(reference[index + 1] - candidate[index + 1]) +
        Math.abs(reference[index + 2] - candidate[index + 2])) /
        3,
    );
  const sorted = [...errors].sort((a, b) => a - b);
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    mean: errors.reduce((sum, value) => sum + value, 0) / errors.length,
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1),
  };
}
function formatStats(stats) {
  return `mean=${stats.mean.toFixed(3)} p95=${stats.p95.toFixed(3)} p99=${stats.p99.toFixed(3)} max=${stats.max.toFixed(3)}`;
}
function assertStats(name, backend, actual, limits) {
  for (const metric of ["mean", "p95", "p99", "max"])
    assert.ok(
      actual[metric] <= limits[metric],
      `${name} ${backend} ${metric} ${actual[metric]} exceeds ${limits[metric]} (${formatStats(actual)})`,
    );
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

function compile(source) {
  const result = compileFragmentArtifact(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}
const vector = compile(
  await readFile(
    new URL("../../../apps/vite-basic/src/pr3-math.shdr.ts", import.meta.url),
    "utf8",
  ),
);
const readable = compile(
  await readFile(
    new URL(
      "../../../apps/vite-basic/src/readable-output.shdr.ts",
      import.meta.url,
    ),
    "utf8",
  ),
);
assert.match(
  readable.glsl,
  /vec2 inputMouse = vec2\(u_mouse\.x, u_resolution\.y - u_mouse\.y\)/,
);
assert.match(readable.wgsl, /let shdr_local_3: f32 = shdr_local_2;/);
const scalar =
  compile(`import { createFragmentShader, sqrt, exp, tanh, clamp, pow, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const x = coord.x / uniforms.resolution.x;
  const y = coord.y / uniforms.resolution.y;
  return vec4(sqrt(x) * 0.3 + exp(-y) * 0.1, clamp(pow(y, 2), 0.1, 0.9), tanh(x) * 0.5, 1);
});`);
const tanhDynamic = compile(
  `import { createFragmentShader, defineUniforms, tanh, vec2, vec3, vec4 } from "shdr";
export default defineUniforms((u) => ({ value: u.f32(0) })).createFragmentShader(({ coord, uniforms }) => {
  const value = uniforms.value + coord.x * 0.0;
  const scalar = tanh(value);
  const vector2 = tanh(vec2(value, -value));
  const vector3 = tanh(vec3(value, -value, value * 0.5));
  const vector4 = tanh(vec4(value, -value, value * 0.5, -value * 0.5));
  return vec4(
    (scalar + 1) * 0.5,
    (vector2.y + 1) * 0.5,
    (vector3.z * 0.75 + vector4.w * 0.25 + 1) * 0.5,
    1
  );
});`,
);
assert.match(tanhDynamic.glsl, /tanh\(clamp\(/);
assert.match(tanhDynamic.wgsl, /tanh\(clamp\(/);
assert.doesNotMatch(tanhDynamic.wgsl, /shdr_internal_safe_clamp/);
const mixed = compile(
  `import { clamp, createFragmentShader, defineUniforms, pow, vec2, vec3, vec4 } from "shdr";
export default defineUniforms((u) => ({ gain: u.f32(0.35) })).createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const v2 = vec2(uv.x * 0.7 + 0.1, uv.y * 0.5 + 0.2);
  const v3 = vec3(v2, 0.4);
  const v4 = vec4(v3, 0.6);
  const c2ss = clamp(v2, uniforms.gain, uniforms.gain);
  const c2sv = clamp(v2, uniforms.gain, vec2(0.85));
  const c2vs = clamp(v2, vec2(0.05), uniforms.gain);
  const p2 = pow(vec2(0.4, 0.8), uniforms.gain);
  const c3ss = clamp(v3, uniforms.gain, uniforms.gain);
  const c3sv = clamp(v3, uniforms.gain, vec3(0.85));
  const c3vs = clamp(v3, vec3(0.05), uniforms.gain);
  const p3 = pow(vec3(0.4, 0.7, 0.9), uniforms.gain);
  const c4ss = clamp(v4, uniforms.gain, uniforms.gain);
  const c4sv = clamp(v4, uniforms.gain, vec4(0.85));
  const c4vs = clamp(v4, vec4(0.05), uniforms.gain);
  const p4 = pow(vec4(0.4, 0.6, 0.8, 0.9), uniforms.gain);
  return vec4(
    c2ss.x * 0.13 + c2sv.y * 0.17 + c2vs.x * 0.22 + p2.y * 0.31,
    c3ss.x * 0.13 + c3sv.y * 0.17 + c3vs.z * 0.22 + p3.z * 0.31,
    c4ss.x * 0.13 + c4sv.y * 0.17 + c4vs.z * 0.22 + p4.w * 0.31,
    1
  );
});`,
);

function mixedReference(gain, x, y) {
  const uv = [(x + 0.5) / 32, (y + 0.5) / 32];
  const v2 = [uv[0] * 0.7 + 0.1, uv[1] * 0.5 + 0.2];
  const v3 = [v2[0], v2[1], 0.4];
  const v4 = [v3[0], v3[1], v3[2], 0.6];
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const scalarClamp = (value) => value.map((item) => clamp(item, gain, gain));
  const upperClamp = (value) => value.map((item) => clamp(item, gain, 0.85));
  const lowerClamp = (value) => value.map((item) => clamp(item, 0.05, gain));
  const p2 = [Math.pow(0.4, gain), Math.pow(0.8, gain)];
  const p3 = [Math.pow(0.4, gain), Math.pow(0.7, gain), Math.pow(0.9, gain)];
  const p4 = [
    Math.pow(0.4, gain),
    Math.pow(0.6, gain),
    Math.pow(0.8, gain),
    Math.pow(0.9, gain),
  ];
  const c2ss = scalarClamp(v2);
  const c2sv = upperClamp(v2);
  const c2vs = lowerClamp(v2);
  const c3ss = scalarClamp(v3);
  const c3sv = upperClamp(v3);
  const c3vs = lowerClamp(v3);
  const c4ss = scalarClamp(v4);
  const c4sv = upperClamp(v4);
  const c4vs = lowerClamp(v4);
  return [
    c2ss[0] * 0.13 + c2sv[1] * 0.17 + c2vs[0] * 0.22 + p2[1] * 0.31,
    c3ss[0] * 0.13 + c3sv[1] * 0.17 + c3vs[2] * 0.22 + p3[2] * 0.31,
    c4ss[0] * 0.13 + c4sv[1] * 0.17 + c4vs[2] * 0.22 + p4[3] * 0.31,
    1,
  ];
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
  await page.route(url, (route) =>
    route.fulfill({
      body: '<!doctype html><canvas id="gl" width="32" height="32"></canvas><canvas id="gpu" width="32" height="32"></canvas>',
    }),
  );
  await page.goto(url);
  await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    window.glRenderer = await createWebGlRenderer(
      document.querySelector("#gl"),
      artifact,
      { animate: false },
    );
    window.gpuRenderer = await createWebGpuRenderer(
      document.querySelector("#gpu"),
      artifact,
      { animate: false },
    );
  }, vector);
  const samples = [
    [2, 4],
    [8, 13],
    [19, 23],
    [29, 30],
  ];
  await expectPixels("vector", samples, (x, y) => {
    const uv = [(x + 0.5) / 32, (y + 0.5) / 32, 0.8];
    return [
      ...uv.map((value, i) => {
        const bright = Math.sqrt(Math.min(0.9, Math.max(0.01, value ** 2)));
        return Math.round(
          255 *
            (bright * 0.3 +
              Math.exp([0.1, -0.2, 0][i]) * 0.1 +
              Math.tanh(0.5) * 0.4),
        );
      }),
      255,
    ];
  });
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, scalar);
  await expectPixels("scalar", samples, (x, y) => {
    const u = (x + 0.5) / 32;
    const v = (y + 0.5) / 32;
    return [
      Math.round(255 * (Math.sqrt(u) * 0.3 + Math.exp(-v) * 0.1)),
      Math.round(255 * Math.min(0.9, Math.max(0.1, v ** 2))),
      Math.round(255 * Math.tanh(u) * 0.5),
      255,
    ];
  });
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, tanhDynamic);
  for (const value of [
    -1e6,
    -1000,
    -100,
    -89,
    -80,
    -1,
    -1e-4,
    0,
    1e-4,
    1,
    80,
    89,
    100,
    1000,
    1e6,
  ]) {
    await page.evaluate(async (value) => {
      await Promise.all(
        [window.glRenderer, window.gpuRenderer].map(async (renderer) => {
          renderer.setUniforms({ value });
          return renderer.draw();
        }),
      );
    }, value);
    await expectPixels(
      `bounded tanh ${value}`,
      samples,
      () => [
        Math.round(255 * ((Math.tanh(value) + 1) * 0.5)),
        Math.round(255 * ((Math.tanh(-value) + 1) * 0.5)),
        Math.round(
          255 *
            ((Math.tanh(value * 0.5) * 0.75 +
              Math.tanh(-value * 0.5) * 0.25 +
              1) *
              0.5),
        ),
        255,
      ],
    );
  }
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, readable);
  await expectPixels("readable locals and grouped f32", samples, (x, y) => {
    const u = (x + 0.5) / 32;
    const v = (y + 0.5) / 32;
    const a = u * 0.3;
    const grouped = v * 0.2 + 0.1; // automatic mouse starts at (0, 0)
    return [
      Math.round(255 * (a + grouped)),
      Math.round(255 * (a * grouped)),
      Math.round(255 * v * 0.5),
      255,
    ];
  });
  assert.deepEqual(mixed.custom.referenced, {
    glsl: ["gain"],
    wgsl: ["gain"],
  });
  await page.evaluate(async (artifact) => {
    await Promise.all([
      window.glRenderer.setShader(artifact),
      window.gpuRenderer.setShader(artifact),
    ]);
  }, mixed);
  await expectPixels("mixed-shape default gain", samples, (x, y) =>
    mixedReference(0.35, x, y).map((value) => Math.round(255 * value)),
  );
  await page.evaluate(async () => {
    await Promise.all(
      [window.glRenderer, window.gpuRenderer].map(async (renderer) => {
        renderer.setUniforms({ gain: 0.55 });
        return renderer.draw();
      }),
    );
  });
  await expectPixels("mixed-shape updated gain", samples, (x, y) =>
    mixedReference(0.55, x, y).map((value) => Math.round(255 * value)),
  );
  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    "Verified PR 3 math and readable/grouped/fallback output in WebGL and presented WebGPU pixels.",
  );

  async function expectPixels(label, points, reference) {
    const glPixels = await page.evaluate((positions) => {
      const gl = document.querySelector("#gl").getContext("webgl2");
      gl.finish();
      return positions.map(([x, y]) => {
        const data = new Uint8Array(4);
        gl.readPixels(
          x,
          gl.drawingBufferHeight - y - 1,
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        return [...data];
      });
    }, points);
    const png = await page.locator("#gpu").screenshot();
    const gpuPixels = await page.evaluate(
      async ({ bytes, positions }) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return positions.map(([x, y]) => [
          ...context.getImageData(x, y, 1, 1).data,
        ]);
      },
      { bytes: [...png], positions: points },
    );
    for (const [index, [x, y]] of points.entries()) {
      const expected = reference(x, y);
      for (const [backend, pixels] of [
        ["WebGL", glPixels],
        ["WebGPU", gpuPixels],
      ]) {
        for (let channel = 0; channel < 4; channel++)
          assert.ok(
            Math.abs(pixels[index][channel] - expected[channel]) <= 7,
            `${label}, ${backend} (${x},${y}) channel ${channel}: ${pixels[index]}, expected ${expected}`,
          );
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}

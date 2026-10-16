import assert from "node:assert/strict";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

const PI = Math.PI;
const points = [
  [2, 4],
  [8, 13],
  [19, 23],
  [29, 30],
];
const tolerance = 8;

function compile(source) {
  const result = compileFragmentArtifact(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}

function unarySource(name, input, encode) {
  const encoded = (expression) => encode.replaceAll("VALUE", `(${expression})`);
  return `import { ${name}, createFragmentShader, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(() => {
  const scalar = ${name}(${input.scalar});
  const vector2 = ${name}(vec2(${input.vector2.join(", ")}));
  const vector3 = ${name}(vec3(${input.vector3.join(", ")}));
  const vector4 = ${name}(vec4(${input.vector4.join(", ")}));
  return vec4(${encoded("scalar")}, ${encoded("vector2.x")}, ${encoded("vector3.y")}, ${encoded("vector4.w")});
});`;
}

const inverseInput = {
  scalar: "0.5",
  vector2: [-1, 0.5],
  vector3: [-0.5, 0, 0.5],
  vector4: [-0.5, 0, 0.5, 1],
};
const radiansInput = {
  scalar: "45",
  vector2: [-90, 0],
  vector3: [-90, 0, 90],
  vector4: [-90, 0, 90, 45],
};
const degreesInput = {
  scalar: "0.7853981633974483",
  vector2: [-1.5707963267948966, 0],
  vector3: [-1.5707963267948966, 0, 1.5707963267948966],
  vector4: [-1.5707963267948966, 0, 1.5707963267948966, 0.7853981633974483],
};
const unaryCases = [
  {
    name: "asin",
    source: unarySource(
      "asin",
      inverseInput,
      "0.5 + VALUE / 3.141592653589793 * 0.5",
    ),
    expected: [0.5 + (Math.asin(0.5) / PI) * 0.5, 0.25, 0.5, 0.75],
  },
  {
    name: "acos",
    source: unarySource("acos", inverseInput, "VALUE / 3.141592653589793"),
    expected: [Math.acos(0.5) / PI, 1, 0.5, 0],
  },
  {
    name: "atan unary",
    source: unarySource(
      "atan",
      inverseInput,
      "0.5 + VALUE / 3.141592653589793 * 0.5",
    ),
    expected: [
      0.5 + (Math.atan(0.5) / PI) * 0.5,
      0.5 + (Math.atan(-1) / PI) * 0.5,
      0.5,
      0.5 + (Math.atan(1) / PI) * 0.5,
    ],
  },
  {
    name: "radians",
    source: unarySource(
      "radians",
      radiansInput,
      "0.5 + VALUE / 3.141592653589793 * 0.5",
    ),
    expected: [0.625, 0.25, 0.5, 0.625],
  },
  {
    name: "degrees",
    source: unarySource("degrees", degreesInput, "0.5 + VALUE / 180.0 * 0.5"),
    expected: [0.625, 0.25, 0.5, 0.625],
  },
];

const binarySource = `import { atan, createFragmentShader, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(() => {
  const scalar = atan(1, 1);
  const vector2 = atan(vec2(1, 1), vec2(1, -1));
  const vector3 = atan(vec3(1, -1, 1), vec3(1, 1, -1));
  const vector4 = atan(vec4(1, 1, -1, -1), vec4(1, -1, -1, 1));
  return vec4(
    0.5 + scalar / 6.283185307179586,
    0.5 + vector2.x / 6.283185307179586,
    0.5 + vector3.y / 6.283185307179586,
    0.5 + vector4.z / 6.283185307179586,
  );
});`;
const binaryCase = {
  name: "atan binary quadrants",
  source: binarySource,
  expected: [0.625, 0.625, 0.375, 0.125],
};

const axisSource = `import { atan, createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(() => {
  return vec4(
    0.5 + atan(0.001, 1) / 6.283185307179586,
    0.5 + atan(1, 0.001) / 6.283185307179586,
    0.5 + atan(0.001, -1) / 6.283185307179586,
    0.5 + atan(-0.001, -1) / 6.283185307179586,
  );
});`;
const axisCase = {
  name: "atan near axes and branch cut",
  source: axisSource,
  expected: [
    0.5 + Math.atan2(0.001, 1) / (2 * PI),
    0.5 + Math.atan2(1, 0.001) / (2 * PI),
    0.5 + Math.atan2(0.001, -1) / (2 * PI),
    0.5 + Math.atan2(-0.001, -1) / (2 * PI),
  ],
};

const modSource = `import { createFragmentShader, mod, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(() => {
  const scalar = mod(-1.5, 1);
  const vector2 = mod(vec2(-1.5, 1.5), vec2(1, -1));
  const vector3 = mod(vec3(-1.5, 1.5, -1.5), vec3(1, -1, -1));
  const vector4 = mod(vec4(-1.5, 1.5, -1.5, 1.5), -1);
  return vec4(
    0.5 + scalar * 0.25,
    0.5 + vector2.x * 0.25,
    0.5 + vector3.y * 0.25,
    0.5 + vector4.z * 0.25,
  );
});`;
const modCase = {
  name: "mod signed and broadcast",
  source: modSource,
  expected: [0.625, 0.625, 0.375, 0.375],
};

const dynamicSource = `import { createFragmentShader, defineUniforms, mod, vec2, vec4 } from "shdr";
export default defineUniforms((u) => ({ phase: u.f32(-0.25) })).createFragmentShader(({ uniforms }) => {
  const value = mod(vec2(uniforms.phase, -uniforms.phase), 1);
  return vec4(value.x * 0.5 + 0.5, value.y * 0.5 + 0.5, 0, 1);
});`;
const dynamicArtifact = compile(dynamicSource);
const artifacts = [
  ...unaryCases.map((item) => ({ ...item, artifact: compile(item.source) })),
  { ...binaryCase, artifact: compile(binaryCase.source) },
  { ...axisCase, artifact: compile(axisCase.source) },
  { ...modCase, artifact: compile(modCase.source) },
];

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
    throw new Error("Vite server unavailable.");
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
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
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
  }, artifacts[0].artifact);

  async function install(artifact) {
    await page.evaluate(async (next) => {
      await Promise.all([
        window.glRenderer.setShader(next),
        window.gpuRenderer.setShader(next),
      ]);
    }, artifact);
  }

  async function expectPixels(label, expected) {
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
        if (!context) throw new Error("GPU screenshot context unavailable.");
        context.drawImage(image, 0, 0);
        return positions.map(([x, y]) => [
          ...context.getImageData(x, y, 1, 1).data,
        ]);
      },
      { bytes: [...png], positions: points },
    );
    for (let index = 0; index < points.length; index++) {
      const expectedPixel = expected.map((value) => Math.round(value * 255));
      expectedPixel[3] = 255;
      for (const [backend, pixel] of [
        ["WebGL", glPixels[index]],
        ["presented WebGPU", gpuPixels[index]],
      ]) {
        for (let channel = 0; channel < 4; channel++) {
          assert.ok(
            Math.abs(pixel[channel] - expectedPixel[channel]) <= tolerance,
            `${label} ${backend} ${points[index]}: ${pixel}, expected ${expectedPixel}`,
          );
        }
      }
      for (let channel = 0; channel < 4; channel++) {
        assert.ok(
          Math.abs(glPixels[index][channel] - gpuPixels[index][channel]) <=
            tolerance,
          `${label} backend parity ${points[index]}: ${glPixels[index]} vs ${gpuPixels[index]}`,
        );
      }
    }
  }

  for (const item of artifacts) {
    await install(item.artifact);
    await expectPixels(item.name, item.expected);
  }

  await install(dynamicArtifact);
  await page.evaluate(async () => {
    for (const renderer of [window.glRenderer, window.gpuRenderer]) {
      renderer.setUniforms({ phase: -0.25 });
      await renderer.draw();
    }
  });
  await expectPixels("dynamic uniform initial", [0.875, 0.625, 0, 1]);
  await page.evaluate(async () => {
    for (const renderer of [window.glRenderer, window.gpuRenderer]) {
      renderer.setUniforms({ phase: 0.25 });
      await renderer.draw();
    }
  });
  await expectPixels("dynamic uniform updated", [0.625, 0.875, 0, 1]);

  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    "Verified orbit trig/mod mathematical outputs, signed broadcasting, atan quadrants/near-axes, dynamic uniform updates, and WebGL/presented-WebGPU parity.",
  );
} finally {
  await browser?.close();
  await server.close();
}

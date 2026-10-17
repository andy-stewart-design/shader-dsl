import assert from "node:assert/strict";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

const sizes = [2, 3, 4];
const data = {
  2: {
    a: [
      [0.2, 0.1],
      [0.3, 0.4],
    ],
    b: [
      [0.5, 0.2],
      [0.1, 0.3],
    ],
    vector: [0.7, 0.9],
    probeA: [0.8, 0.6],
    probeB: [0.3, 0.9],
    scalar: 0.75,
  },
  3: {
    a: [
      [0.12, 0.03, 0.02],
      [0.01, 0.14, 0.04],
      [0.05, 0.02, 0.16],
    ],
    b: [
      [0.11, 0.02, 0.01],
      [0.03, 0.13, 0.02],
      [0.04, 0.01, 0.15],
    ],
    vector: [0.7, 0.8, 0.9],
    probeA: [0.6, 0.7, 0.8],
    probeB: [0.2, 0.5, 0.9],
    scalar: 0.7,
  },
  4: {
    a: [
      [0.1, 0.02, 0.01, 0.03],
      [0.01, 0.11, 0.025, 0.015],
      [0.02, 0.03, 0.12, 0.01],
      [0.04, 0.01, 0.02, 0.13],
    ],
    b: [
      [0.08, 0.015, 0.02, 0.01],
      [0.025, 0.09, 0.01, 0.02],
      [0.01, 0.02, 0.1, 0.015],
      [0.03, 0.01, 0.025, 0.07],
    ],
    vector: [0.65, 0.75, 0.85, 0.95],
    probeA: [0.55, 0.65, 0.75, 0.85],
    probeB: [0.15, 0.35, 0.65, 0.95],
    scalar: 0.65,
  },
};
const tolerance = 8;
const points = [
  [4, 4],
  [16, 8],
  [28, 24],
];

function compile(source) {
  const result = compileFragmentArtifact(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}

function vectorName(size) {
  return `vec${size}`;
}

function matrixName(size) {
  return `mat${size}`;
}

function columnMajorValues(matrix) {
  return matrix.flatMap((_, column) => matrix.map((row) => row[column]));
}

function matrixExpression(size, matrix) {
  return `${matrixName(size)}(${columnMajorValues(matrix).join(", ")})`;
}

function vectorExpression(size, vector) {
  return `${vectorName(size)}(${vector.join(", ")})`;
}

function shaderImports(size) {
  return [...new Set([matrixName(size), vectorName(size), "vec4"])].join(", ");
}

function add(left, right) {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value + right[rowIndex][columnIndex]),
  );
}

function subtract(left, right) {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - right[rowIndex][columnIndex]),
  );
}

function scale(matrix, scalar) {
  return matrix.map((row) => row.map((value) => value * scalar));
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function multiplyVectorMatrix(vector, matrix) {
  return matrix[0].map((_, column) =>
    matrix.reduce((sum, row, index) => sum + vector[index] * row[column], 0),
  );
}

function multiplyMatrixMatrix(left, right) {
  return left.map((row) =>
    right[0].map((_, column) =>
      right.reduce(
        (sum, rightRow, index) => sum + row[index] * rightRow[column],
        0,
      ),
    ),
  );
}

function encoded(value) {
  return `0.5 + (${value}) * 0.5`;
}

function outputExpression(size, vector) {
  return outputExpressionFor(size, vector, "result");
}

function outputExpressionFor(size, vector, variable, lane = 0) {
  const components =
    size === 4
      ? lane === 1
        ? [3, 0, 1]
        : [0, 1, 2]
      : vector.map((_, index) => index);
  const values = components.map((index) =>
    encoded(`${variable}.${"xyzw"[index]}`),
  );
  const suffix = size === 2 ? ", 0, 1" : ", 1";
  return `vec4(${values.join(", ")}${suffix})`;
}

function matrixSource(size, matrixExpressionText, probe, lane = 0) {
  return `import { createFragmentShader, ${shaderImports(size)} } from "shdr";
export default createFragmentShader(() => {
  const matrix = ${matrixExpressionText};
  const result = matrix * ${vectorExpression(size, probe)};
  return ${outputExpressionFor(size, probe, "result", lane)};
});`;
}

function expectedPixel(vector, lane = 0) {
  const values = vector.map((value) => 0.5 + value * 0.5);
  if (values.length === 2) return [...values, 0, 1];
  if (values.length === 3) return [...values, 1];
  return lane === 1
    ? [values[3], values[0], values[1], 1]
    : [values[0], values[1], values[2], 1];
}

const cases = [];
const exactA = "mat2(1, 2, 3, 4)";
const exactB = "mat2(2, 0, 1, 3)";
const exactExpected = (vector) => [
  0.1 + vector[0] / 50,
  0.1 + vector[1] / 50,
  0,
  1,
];
for (const [name, expression, vector] of [
  ["A times v", `${exactA} * vec2(5, 6)`, [23, 34]],
  ["v times A", `vec2(5, 6) * ${exactA}`, [17, 39]],
]) {
  cases.push({
    name: `exact 2x2 ${name}`,
    source: `import { createFragmentShader, mat2, vec2, vec4 } from "shdr";
export default createFragmentShader(() => {
  const result = ${expression};
  return vec4(0.1 + result.x / 50, 0.1 + result.y / 50, 0, 1);
});`,
    expected: exactExpected(vector),
  });
}
for (const [name, expression, probes] of [
  [
    "A times B",
    `${exactA} * ${exactB}`,
    [
      [2, 4],
      [10, 14],
    ],
  ],
  [
    "B times A",
    `${exactB} * ${exactA}`,
    [
      [4, 6],
      [10, 12],
    ],
  ],
]) {
  for (const [index, probe] of probes.entries()) {
    cases.push({
      name: `exact 2x2 ${name} column ${index}`,
      source: `import { createFragmentShader, mat2, vec2, vec4 } from "shdr";
export default createFragmentShader(() => {
  const result = (${expression}) * vec2(${index === 0 ? "1, 0" : "0, 1"});
  return vec4(0.1 + result.x / 50, 0.1 + result.y / 50, 0, 1);
});`,
      expected: exactExpected(probe),
    });
  }
}
for (const size of sizes) {
  const current = data[size];
  const matrix = matrixExpression(size, current.a);
  for (const [label, expression] of [
    ["diagonal zero", `${matrixName(size)}(0)`],
    ["diagonal identity", `${matrixName(size)}(1)`],
    ["diagonal non-unit", `${matrixName(size)}(1.1)`],
    ["explicit coefficients", matrix],
    [
      "complete columns",
      `${matrixName(size)}(${current.a
        .map((_, column) =>
          vectorExpression(
            size,
            current.a.map((row) => row[column]),
          ),
        )
        .join(", ")})`,
    ],
    ["same-size copy", `${matrixName(size)}(${matrix})`],
  ]) {
    for (const probe of [current.probeA, current.probeB]) {
      for (const lane of size === 4 ? [0, 1] : [0]) {
        const result = expression.startsWith(`${matrixName(size)}(0)`)
          ? Array(size).fill(0)
          : expression.startsWith(`${matrixName(size)}(1.1)`)
            ? probe.map((value) => value * 1.1)
            : expression.startsWith(`${matrixName(size)}(1)`)
              ? probe
              : multiplyMatrixVector(current.a, probe);
        cases.push({
          name: `${size}x${size} ${label} lane ${lane}`,
          source: matrixSource(size, expression, probe, lane),
          expected: expectedPixel(result, lane),
        });
      }
    }
  }

  const a = matrixExpression(size, current.a);
  const b = matrixExpression(size, current.b);
  const v = vectorExpression(size, current.vector);
  const arithmetic = [
    ["addition", `${a} + ${b}`, add(current.a, current.b), "matrix"],
    ["subtraction", `${a} - ${b}`, subtract(current.a, current.b), "matrix"],
    [
      "matrix-right scale",
      `${a} * ${current.scalar}`,
      scale(current.a, current.scalar),
      "matrix",
    ],
    [
      "matrix-left scale",
      `${current.scalar} * ${a}`,
      scale(current.a, current.scalar),
      "matrix",
    ],
    [
      "matrix-vector",
      `${a} * ${v}`,
      multiplyMatrixVector(current.a, current.vector),
      "vector",
    ],
    [
      "vector-matrix",
      `${v} * ${a}`,
      multiplyVectorMatrix(current.vector, current.a),
      "vector",
    ],
    [
      "matrix composition",
      `${a} * ${b}`,
      multiplyMatrixMatrix(current.a, current.b),
      "matrix",
    ],
  ];
  for (const [label, expression, result, kind] of arithmetic) {
    const probes =
      kind === "matrix" ? [current.probeA, current.probeB] : [null];
    for (const probe of probes) {
      for (const lane of size === 4 ? [0, 1] : [0]) {
        const vectorResult =
          kind === "matrix" ? multiplyMatrixVector(result, probe) : result;
        const imports = shaderImports(size);
        cases.push({
          name: `${size}x${size} ${label}${probe ? " probe" : ""} lane ${lane}`,
          source: `import { createFragmentShader, ${imports} } from "shdr";
export default createFragmentShader(() => {
  const result = ${expression};
  ${kind === "matrix" ? `const probe = result * ${vectorExpression(size, probe)};` : ""}
  return ${kind === "matrix" ? outputExpressionFor(size, probe, "probe", lane) : outputExpressionFor(size, result, "result", lane)};
});`,
          expected: expectedPixel(vectorResult, lane),
        });
      }
    }
  }
}

const dynamicSource = `import { createFragmentShader, defineShaderFunction, defineUniforms, mat2, vec2, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
const uniforms = defineUniforms((u) => ({ gain: u.f32(1) }));
const diagonal = defineShaderFunction((gain: Expr<F32>) => mat2(gain));
export default createFragmentShader(({ uniforms }) => {
  const matrix = diagonal(uniforms.gain);
  const result = matrix * vec2(0.2, 0.4);
  return vec4(0.5 + result.x * 0.5, 0.5 + result.y * 0.5, 0, 1);
}, { uniforms });`;
const dynamicArtifact = compile(dynamicSource);

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
  await page.evaluate(
    async (artifact) => {
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
    },
    cases[0].artifact ?? compile(cases[0].source),
  );

  async function install(artifact) {
    await page.evaluate(async (next) => {
      await Promise.all([
        window.glRenderer.setShader(next),
        window.gpuRenderer.setShader(next),
      ]);
    }, artifact);
  }

  async function readPixels() {
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
    const screenshot = await page.locator("#gpu").screenshot();
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
      { bytes: [...screenshot], positions: points },
    );
    return { glPixels, gpuPixels };
  }

  async function expectPixels(name, expected) {
    const { glPixels, gpuPixels } = await readPixels();
    for (const [index, point] of points.entries()) {
      const expectedPixel = expected.map((value) => Math.round(value * 255));
      for (const [backend, pixel] of [
        ["WebGL", glPixels[index]],
        ["presented WebGPU", gpuPixels[index]],
      ]) {
        for (let channel = 0; channel < 4; channel++) {
          assert.ok(
            Math.abs(pixel[channel] - expectedPixel[channel]) <= tolerance,
            `${name} ${backend} ${point}: ${pixel}, expected ${expectedPixel}`,
          );
        }
      }
      for (let channel = 0; channel < 4; channel++) {
        assert.ok(
          Math.abs(glPixels[index][channel] - gpuPixels[index][channel]) <=
            tolerance,
          `${name} backend parity ${point}: ${glPixels[index]} vs ${gpuPixels[index]}`,
        );
      }
    }
  }

  for (const item of cases) {
    const artifact = compile(item.source);
    await install(artifact);
    await expectPixels(item.name, item.expected);
  }

  await install(dynamicArtifact);
  await page.evaluate(async () => {
    for (const renderer of [window.glRenderer, window.gpuRenderer]) {
      renderer.setUniforms({ gain: 1 });
      await renderer.draw();
    }
  });
  await expectPixels(
    "dynamic scalar uniform initial",
    expectedPixel([0.2, 0.4]),
  );
  await page.evaluate(async () => {
    for (const renderer of [window.glRenderer, window.gpuRenderer]) {
      renderer.setUniforms({ gain: 1.5 });
      await renderer.draw();
    }
  });
  await expectPixels(
    "dynamic scalar uniform updated",
    expectedPixel([0.3, 0.6]),
  );

  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    window.glRenderer.dispose();
    window.gpuRenderer.dispose();
  });
  console.log(
    `Verified ${cases.length} square-matrix rendered cases, both multiplication directions, noncommuting composition, constructors, dynamic uniform updates, and WebGL/presented-WebGPU parity.`,
  );
} finally {
  await browser?.close();
  await server.close();
}

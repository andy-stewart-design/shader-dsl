import { chromium, type Page } from "playwright";
import { expect, it } from "vitest";

type Size = 2 | 3 | 4;
type ConstructorFamily = "diagonal" | "coefficients" | "columns" | "copy";
type BinaryFamily = "M+M" | "M-M" | "M*S" | "S*M" | "M*V" | "V*M" | "M*M";

const sizes: readonly Size[] = [2, 3, 4];
const constructorFamilies: readonly ConstructorFamily[] = [
  "diagonal",
  "coefficients",
  "columns",
  "copy",
];
const binaryFamilies: readonly BinaryFamily[] = [
  "M+M",
  "M-M",
  "M*S",
  "S*M",
  "M*V",
  "V*M",
  "M*M",
];

const glslMatrix = (size: Size) => `mat${size}`;
const glslVector = (size: Size) => `vec${size}`;
const wgslMatrix = (size: Size) => `mat${size}x${size}<f32>`;
const wgslVector = (size: Size) => `vec${size}<f32>`;
const glslValues = (size: Size) =>
  Array.from({ length: size * size }, (_, index) => `${index + 1}.0`).join(
    ", ",
  );
const wgslValues = (size: Size) =>
  Array.from({ length: size * size }, (_, index) => `${index + 1}.0f`).join(
    ", ",
  );
const glslVectorValues = (size: Size, offset = 0) =>
  Array.from({ length: size }, (_, index) => `${index + offset + 1}.0`).join(
    ", ",
  );
const wgslVectorValues = (size: Size, offset = 0) =>
  Array.from({ length: size }, (_, index) => `${index + offset + 1}.0f`).join(
    ", ",
  );
const wgslDiagonalColumns = (size: Size, value: string) =>
  Array.from(
    { length: size },
    (_, column) =>
      `${wgslVector(size)}(${Array.from({ length: size }, (_, row) => (row === column ? value : "0.0f")).join(", ")})`,
  ).join(", ");

function glslColor(size: Size, value: string): string {
  switch (size) {
    case 2:
      return `vec4(${value}, 0.0, 1.0)`;
    case 3:
      return `vec4(${value}, 1.0)`;
    case 4:
      return value;
  }
}

function wgslColor(size: Size, value: string): string {
  switch (size) {
    case 2:
      return `vec4<f32>(${value}, 0.0f, 1.0f)`;
    case 3:
      return `vec4<f32>(${value}, 1.0f)`;
    case 4:
      return value;
  }
}

function constructorSources(size: Size, family: ConstructorFamily) {
  const gm = glslMatrix(size);
  const gv = glslVector(size);
  const wm = wgslMatrix(size);
  const wv = wgslVector(size);
  const glslDirect = {
    diagonal: `${gm}(0.5)`,
    coefficients: `${gm}(${glslValues(size)})`,
    columns: `${gm}(${Array.from(
      { length: size },
      (_, index) => `${gv}(${glslVectorValues(size, index)})`,
    ).join(", ")})`,
    copy: `${gm}(${gm}(${glslValues(size)}))`,
  }[family];
  const wgslDirect = {
    diagonal: `${wm}(${wgslDiagonalColumns(size, "0.5f")})`,
    coefficients: `${wm}(${wgslValues(size)})`,
    columns: `${wm}(${Array.from(
      { length: size },
      (_, index) => `${wv}(${wgslVectorValues(size, index)})`,
    ).join(", ")})`,
    copy: `${wm}(${wm}(${wgslValues(size)}))`,
  }[family];
  const glslFunction = {
    diagonal: `${gm} make(float value) { return ${gm}(value); }`,
    coefficients: `${gm} make(float value) { return ${gm}(value, ${glslValues(size).split(", ").slice(1).join(", ")}); }`,
    columns: `${gm} make(${Array.from(
      { length: size },
      (_, index) => `${gv} c${index}`,
    ).join(
      ", ",
    )}) { return ${gm}(${Array.from({ length: size }, (_, index) => `c${index}`).join(", ")}); }`,
    copy: `${gm} make(${gm} value) { return ${gm}(value); }`,
  }[family];
  const wgslFunction = {
    diagonal: `fn make(value: f32) -> ${wm} { return ${wm}(${wgslDiagonalColumns(size, "value")}); }`,
    coefficients: `fn make(value: f32) -> ${wm} { return ${wm}(value, ${wgslValues(size).split(", ").slice(1).join(", ")}); }`,
    columns: `fn make(${Array.from(
      { length: size },
      (_, index) => `c${index}: ${wv}`,
    ).join(
      ", ",
    )}) -> ${wm} { return ${wm}(${Array.from({ length: size }, (_, index) => `c${index}`).join(", ")}); }`,
    copy: `fn make(value: ${wm}) -> ${wm} { return ${wm}(value); }`,
  }[family];
  const glslCall = {
    diagonal: "make(s)",
    coefficients: `make(s)`,
    columns: `make(${Array.from(
      { length: size },
      (_, index) => `${gv}(${glslVectorValues(size, index + 1)})`,
    ).join(", ")})`,
    copy: `make(direct)`,
  }[family];
  const wgslCall = {
    diagonal: "make(s)",
    coefficients: `make(s)`,
    columns: `make(${Array.from(
      { length: size },
      (_, index) => `${wv}(${wgslVectorValues(size, index + 1)})`,
    ).join(", ")})`,
    copy: `make(direct)`,
  }[family];
  const glslVectorValue = `${gv}(${glslVectorValues(size, 2)})`;
  const wgslVectorValue = `${wv}(${wgslVectorValues(size, 2)})`;
  return {
    label: `constructor ${family} mat${size}`,
    glsl: `#version 300 es
precision highp float;
out vec4 color;
${glslFunction}
void main() {
  float s = 0.75;
  ${gm} direct = ${glslDirect};
  ${gm} dynamic = ${glslCall};
  ${gv} result = (direct + dynamic) * ${glslVectorValue};
  color = ${glslColor(size, "result")};
}`,
    wgsl: `${wgslFunction}
@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> {
  let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u));
  return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f);
}
@fragment fn fragment() -> @location(0) vec4<f32> {
  let s: f32 = 0.75f;
  let direct: ${wm} = ${wgslDirect};
  let dynamic: ${wm} = ${wgslCall};
  let result: ${wv} = (direct + dynamic) * ${wgslVectorValue};
  return ${wgslColor(size, "result")};
}`,
  };
}

function binaryExpressions(size: Size, family: BinaryFamily) {
  const a = "a";
  const b = "b";
  const v = "v";
  const s = "s";
  return {
    "M+M": `${a} + ${b}`,
    "M-M": `${a} - ${b}`,
    "M*S": `${a} * ${s}`,
    "S*M": `${s} * ${a}`,
    "M*V": `${a} * ${v}`,
    "V*M": `${v} * ${a}`,
    "M*M": `${a} * ${b}`,
  }[family]
    .replaceAll("a", a)
    .replaceAll("b", b)
    .replaceAll("v", v)
    .replaceAll("s", s);
}

function binarySources(size: Size, family: BinaryFamily) {
  const gm = glslMatrix(size);
  const gv = glslVector(size);
  const wm = wgslMatrix(size);
  const wv = wgslVector(size);
  const resultIsMatrix =
    family === "M+M" ||
    family === "M-M" ||
    family === "M*S" ||
    family === "S*M" ||
    family === "M*M";
  const resultGlsl = resultIsMatrix
    ? "(result + dynamic) * v"
    : "result + dynamic";
  const resultWgsl = resultIsMatrix
    ? "(result + dynamic) * v"
    : "result + dynamic";
  const glslResultType = resultIsMatrix ? gm : gv;
  const wgslResultType = resultIsMatrix ? wm : wv;
  const glslExpression = binaryExpressions(size, family);
  const wgslExpression = glslExpression;
  const params = {
    "M+M": `${gm} a, ${gm} b`,
    "M-M": `${gm} a, ${gm} b`,
    "M*S": `${gm} a, float s`,
    "S*M": `${gm} a, float s`,
    "M*V": `${gm} a, ${gv} v`,
    "V*M": `${gv} v, ${gm} a`,
    "M*M": `${gm} a, ${gm} b`,
  }[family];
  const wgslParams = {
    "M+M": `a: ${wm}, b: ${wm}`,
    "M-M": `a: ${wm}, b: ${wm}`,
    "M*S": `a: ${wm}, s: f32`,
    "S*M": `a: ${wm}, s: f32`,
    "M*V": `a: ${wm}, v: ${wv}`,
    "V*M": `v: ${wv}, a: ${wm}`,
    "M*M": `a: ${wm}, b: ${wm}`,
  }[family];
  const glslFunction = `${glslResultType} apply(${params}) { return ${glslExpression}; }`;
  const wgslFunction = `fn apply(${wgslParams}) -> ${wgslResultType} { return ${wgslExpression}; }`;
  const glslArgs = {
    "M+M": "a, b",
    "M-M": "a, b",
    "M*S": "a, s",
    "S*M": "a, s",
    "M*V": "a, v",
    "V*M": "v, a",
    "M*M": "a, b",
  }[family];
  const wgslArgs = glslArgs;
  const glslDirect = glslExpression;
  const wgslDirect = wgslExpression;
  return {
    label: `binary ${family} mat${size}`,
    glsl: `#version 300 es
precision highp float;
out vec4 color;
${glslFunction}
void main() {
  float s = 0.75;
  ${gm} a = ${gm}(${glslValues(size)});
  ${gm} b = ${gm}(${glslValues(size).split(", ").reverse().join(", ")});
  ${gv} v = ${gv}(${glslVectorValues(size, 2)});
  ${glslResultType} result = ${glslDirect};
  ${glslResultType} dynamic = apply(${glslArgs});
  ${gv} resultVector = ${resultGlsl};
  color = ${glslColor(size, "resultVector")};
}`,
    wgsl: `${wgslFunction}
@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> {
  let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u));
  return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f);
}
@fragment fn fragment() -> @location(0) vec4<f32> {
  let s: f32 = 0.75f;
  let a: ${wm} = ${wm}(${wgslValues(size)});
  let b: ${wm} = ${wm}(${wgslValues(size).split(", ").reverse().join(", ")});
  let v: ${wv} = ${wv}(${wgslVectorValues(size, 2)});
  let result: ${wgslResultType} = ${wgslDirect};
  let dynamic: ${wgslResultType} = apply(${wgslArgs});
  let resultVector: ${wv} = ${resultWgsl};
  return ${wgslColor(size, "resultVector")};
}`,
  };
}

async function withBrowser<T>(
  callback: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--enable-unsafe-webgpu",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 64, height: 64 });
    await page.route("http://localhost/", (route) =>
      route.fulfill({
        body: `<!doctype html><canvas id="gl-0" width="4" height="4"></canvas><canvas id="gl-1" width="4" height="4"></canvas><canvas id="gl-2" width="4" height="4"></canvas><canvas id="gpu-0" width="4" height="4"></canvas><canvas id="gpu-1" width="4" height="4"></canvas><canvas id="gpu-2" width="4" height="4"></canvas>`,
      }),
    );
    await page.goto("http://localhost/");
    return await callback(page);
  } finally {
    await browser.close();
  }
}

it("compiles all 12 matrix constructor families on real GLSL ES 3.00 and WGSL targets", async () => {
  const samples = sizes.flatMap((size) =>
    constructorFamilies.map((family) => constructorSources(size, family)),
  );
  expect(samples).toHaveLength(12);
  const result = await withBrowser((page) =>
    page.evaluate(
      async ({ samples }) => {
        const canvas = document.querySelector<HTMLCanvasElement>("#gl-0")!;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          return Promise.all(
            samples.map(async (sample) => {
              const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
              gl.shaderSource(shader, sample.glsl);
              gl.compileShader(shader);
              const glsl = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
                ? null
                : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
              gl.deleteShader(shader);
              const info = await device
                .createShaderModule({ code: sample.wgsl })
                .getCompilationInfo();
              return {
                label: sample.label,
                glsl,
                wgsl: info.messages
                  .filter((message) => message.type === "error")
                  .map((message) => message.message),
              };
            }),
          );
        } finally {
          device.destroy();
        }
      },
      { samples },
    ),
  );
  for (const row of result) {
    expect(row.glsl, row.label).toBeNull();
    expect(row.wgsl, row.label).toEqual([]);
  }
});

it("compiles all 21 matrix binary signature families on real GLSL ES 3.00 and WGSL targets", async () => {
  const samples = sizes.flatMap((size) =>
    binaryFamilies.map((family) => binarySources(size, family)),
  );
  expect(samples).toHaveLength(21);
  const result = await withBrowser((page) =>
    page.evaluate(
      async ({ samples }) => {
        const canvas = document.querySelector<HTMLCanvasElement>("#gl-0")!;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          return Promise.all(
            samples.map(async (sample) => {
              const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
              gl.shaderSource(shader, sample.glsl);
              gl.compileShader(shader);
              const glsl = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
                ? null
                : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
              gl.deleteShader(shader);
              const info = await device
                .createShaderModule({ code: sample.wgsl })
                .getCompilationInfo();
              return {
                label: sample.label,
                glsl,
                wgsl: info.messages
                  .filter((message) => message.type === "error")
                  .map((message) => message.message),
              };
            }),
          );
        } finally {
          device.destroy();
        }
      },
      { samples },
    ),
  );
  for (const row of result) {
    expect(row.glsl, row.label).toBeNull();
    expect(row.wgsl, row.label).toEqual([]);
  }
});

it("preserves asymmetric vector direction and noncommuting 2x2 composition on both targets", async () => {
  const glslFragments = [
    `#version 300 es
precision highp float;
out vec4 color;
void main() {
  mat2 a = mat2(1.0, 2.0, 3.0, 4.0);
  vec2 v = vec2(5.0, 6.0);
  vec2 av = a * v;
  vec2 va = v * a;
  color = vec4(av.x / 128.0, av.y / 128.0, va.x / 64.0, 1.0);
}`,
    `#version 300 es
precision highp float;
out vec4 color;
void main() {
  mat2 a = mat2(1.0, 2.0, 3.0, 4.0);
  mat2 b = mat2(2.0, 0.0, 1.0, 3.0);
  vec2 v = vec2(5.0, 6.0);
  vec2 va = v * a;
  vec2 abv = (a * b) * v;
  color = vec4(va.y / 64.0, abv.x / 128.0, abv.y / 128.0, 1.0);
}`,
    `#version 300 es
precision highp float;
out vec4 color;
void main() {
  mat2 a = mat2(1.0, 2.0, 3.0, 4.0);
  mat2 b = mat2(2.0, 0.0, 1.0, 3.0);
  vec2 v = vec2(5.0, 6.0);
  vec2 bav = (b * a) * v;
  color = vec4(bav.x / 128.0, bav.y / 128.0, 0.0, 1.0);
}`,
  ];
  const wgslFragments = [
    `@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> {
  let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u));
  return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f);
}
@fragment fn fragment() -> @location(0) vec4<f32> {
  let a = mat2x2<f32>(1.0f, 2.0f, 3.0f, 4.0f);
  let v = vec2<f32>(5.0f, 6.0f);
  let av = a * v;
  let va = v * a;
  return vec4<f32>(av.x / 128.0f, av.y / 128.0f, va.x / 64.0f, 1.0f);
}`,
    `@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> {
  let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u));
  return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f);
}
@fragment fn fragment() -> @location(0) vec4<f32> {
  let a = mat2x2<f32>(1.0f, 2.0f, 3.0f, 4.0f);
  let b = mat2x2<f32>(2.0f, 0.0f, 1.0f, 3.0f);
  let v = vec2<f32>(5.0f, 6.0f);
  let va = v * a;
  let abv = (a * b) * v;
  return vec4<f32>(va.y / 64.0f, abv.x / 128.0f, abv.y / 128.0f, 1.0f);
}`,
    `@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> {
  let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u));
  return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f);
}
@fragment fn fragment() -> @location(0) vec4<f32> {
  let a = mat2x2<f32>(1.0f, 2.0f, 3.0f, 4.0f);
  let b = mat2x2<f32>(2.0f, 0.0f, 1.0f, 3.0f);
  let v = vec2<f32>(5.0f, 6.0f);
  let bav = (b * a) * v;
  return vec4<f32>(bav.x / 128.0f, bav.y / 128.0f, 0.0f, 1.0f);
}`,
  ];
  const glPixels = await withBrowser((page) =>
    page.evaluate((fragments) => {
      const vertex = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
      return fragments.map((fragment, index) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          `#gl-${index}`,
        )!;
        const gl = canvas.getContext("webgl2")!;
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type)!;
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(shader) ?? "GLSL compilation failed",
            );
          return shader;
        };
        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) ?? "GLSL link failed");
        gl.useProgram(program);
        gl.viewport(0, 0, 4, 4);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.finish();
        const pixel = new Uint8Array(4);
        gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [...pixel];
      });
    }, glslFragments),
  );
  const gpuPixels = await withBrowser(async (page) => {
    await page.evaluate(async (fragments) => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      const vertex = device.createShaderModule({
        code: `@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4<f32> { let p = vec2<f32>(f32((id << 1u) & 2u), f32(id & 2u)); return vec4<f32>(p * 2.0f - 1.0f, 0.0f, 1.0f); }`,
      });
      const format = navigator.gpu.getPreferredCanvasFormat();
      for (const [index, fragment] of fragments.entries()) {
        const canvas = document.querySelector<HTMLCanvasElement>(
          `#gpu-${index}`,
        )!;
        const context = canvas.getContext("webgpu") as GPUCanvasContext;
        context.configure({ device, format, alphaMode: "opaque" });
        const module = device.createShaderModule({ code: fragment });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(
          (message) => message.type === "error",
        );
        if (errors.length)
          throw new Error(errors.map((message) => message.message).join("\n"));
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: vertex, entryPoint: "vertex" },
          fragment: { module, entryPoint: "fragment", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      }
      await device.queue.onSubmittedWorkDone();
    }, wgslFragments);
    const pixels = [] as number[][];
    for (const index of [0, 1, 2]) {
      const png = await page.locator(`#gpu-${index}`).screenshot();
      pixels.push(
        await page.evaluate(
          async (bytes) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: "image/png" }),
            );
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(bitmap, 0, 0);
            return [...context.getImageData(1, 1, 1, 1).data];
          },
          [...png],
        ),
      );
    }
    return pixels;
  });
  const expected = [
    [46, 68, 68],
    [155, 139, 207],
    [159, 203, 0],
  ];
  for (const [index, values] of expected.entries()) {
    for (const pixels of [glPixels[index]!, gpuPixels[index]!]) {
      expect(pixels.slice(0, 3), `orientation sample ${index}`).toEqual(values);
      expect(pixels[3], `orientation alpha ${index}`).toBe(255);
    }
  }
});

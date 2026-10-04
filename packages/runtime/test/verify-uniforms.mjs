import assert from "node:assert/strict";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const declaration = `import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({
  a: u.vec3(0.2, 0.3, 0.4), b: u.f32(0.5),
  c: u.vec3(0.6, 0.7, 0.8), d: u.f32(0.9),
  unused: u.vec2(0.1, 0.2), tail: u.vec4(0.1, 0.2, 0.3, 0.4),
})).createFragmentShader(({ uniforms }) => BODY);`;
function shader(body, source = declaration) {
  const result = compileFragmentArtifact(source.replace("BODY", body));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}
const initial = shader("vec4(uniforms.a.x, uniforms.b, uniforms.c.x, 1)");
const changed = shader(
  "vec4(uniforms.a.x, uniforms.b, uniforms.c.x, 1)",
  declaration
    .replace("u.f32(0.5)", "u.f32(0.25)")
    .replace("u.vec3(0.2, 0.3, 0.4)", "u.vec3(0.3, 0.3, 0.4)"),
);
const subset = shader(
  "vec4(uniforms.unused.x, uniforms.tail.y, uniforms.d, 1)",
);
const unreferenced = shader("vec4(0.1, 0.2, 0.3, 1)");
const mixed = shader(
  "vec4(uniforms.a.x, uniforms.b, uniforms.resolution.x / 8, 1)",
);
const incompatible = shader(
  "vec4(uniforms.b, uniforms.a, uniforms.c, 1)",
  `import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({ b: u.f32(0.1), a: u.f32(0.2), c: u.f32(0.3) })).createFragmentShader(({ uniforms }) => BODY);`,
);
const plainResult =
  compileFragmentArtifact(`import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ uniforms }) => vec4(0.1, 0.2, 0.3, 1));`);
assert.equal(plainResult.ok, true);
const plain = plainResult.artifact;
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
    throw new Error("Server unavailable");
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
      body: '<!doctype html><canvas id="gl" style="width:8px;height:8px"></canvas><canvas id="gpu" style="width:8px;height:8px"></canvas>',
    }),
  );
  await page.goto(url);
  async function presentedPixel(selector) {
    return page.evaluate(
      async (png) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(png)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        return [...context.getImageData(0, 0, 1, 1).data];
      },
      [...(await page.locator(selector).screenshot())],
    );
  }
  async function pixels(expected, label, selectors = ["#gl", "#gpu"]) {
    for (const [index, selector] of selectors.entries()) {
      const pixel =
        index === 0
          ? await page.evaluate((selector) => {
              const gl = document.querySelector(selector).getContext("webgl2");
              const value = new Uint8Array(4);
              gl.finish();
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
              return [...value];
            }, selector)
          : await presentedPixel(selector);
      assert.ok(
        pixel.every((v, i) => Math.abs(v - Math.round(expected[i] * 255)) <= 2),
        `${label} ${selector}: ${pixel} vs ${expected}`,
      );
    }
  }
  await page.evaluate(
    async ({ initial }) => {
      const { createWebGlRenderer } = await import("/src/webgl.ts");
      const { createWebGpuRenderer } = await import("/src/webgpu.ts");
      const glCanvas = document.querySelector("#gl"),
        gpuCanvas = document.querySelector("#gpu");
      window.renderers = [
        await createWebGlRenderer(glCanvas, initial, {
          animate: false,
          uniforms: { a: [0.4, 0.3, 0.2], b: 0.7 },
        }),
        await createWebGpuRenderer(gpuCanvas, initial, {
          animate: false,
          uniforms: { a: [0.4, 0.3, 0.2], b: 0.7 },
        }),
      ];
    },
    { initial },
  );
  await pixels(
    [0.4, 0.7, 0.6, 1],
    "creation overrides first frame (vec3/f32 packed)",
  );
  const results = await page.evaluate(
    async ({ initial, changed, subset, incompatible }) => {
      const both = async (fn) => Promise.all(window.renderers.map(fn));
      const failures = await both(async (renderer) => {
        const kinds = [];
        for (const bad of [
          { a: [1, 2] },
          { a: undefined },
          { b: undefined },
          { b: Infinity },
          { b: 1e300 },
          { mouse: [0, 0] },
          { b: 0.3, unknown: 1 },
          Object.create({ b: 0.1 }),
          { [Symbol("b")]: 0.1 },
          { a: Array(3) },
        ]) {
          try {
            renderer.setUniforms(bad);
            kinds.push("accepted");
          } catch (e) {
            kinds.push(e.kind);
          }
        }
        try {
          renderer.resetUniforms("b", "unknown");
          kinds.push("accepted");
        } catch (e) {
          kinds.push(e.kind);
        }
        return kinds;
      });
      await both((r) => r.draw());
      window.mutate = async (operation) => {
        if (operation === "set")
          await both((r) => {
            const a = [0.8, 0.1, 0.2];
            r.setUniforms({ a, b: 0.9, c: [0.4, 0.3, 0.2] });
            a[0] = 0;
            return r.draw();
          });
        if (operation === "one")
          await both((r) => {
            r.resetUniforms("b");
            return r.draw();
          });
        if (operation === "reset")
          await both((r) => {
            r.resetUniforms("b", "a");
            return r.draw();
          });
        if (operation === "all")
          await both((r) => {
            r.resetUniforms();
            return r.draw();
          });
        if (operation === "replace") await both((r) => r.setShader(changed));
        if (operation === "subset") await both((r) => r.setShader(subset));
        if (operation === "incompatible")
          await both((r) => r.setShader(incompatible));
        if (operation === "initial") await both((r) => r.setShader(initial));
      };
      window.artifacts = { initial, changed, subset, incompatible };
      return failures;
    },
    { initial, changed, subset, incompatible },
  );
  assert.deepEqual(results, [
    Array(11).fill("uniform"),
    Array(11).fill("uniform"),
  ]);
  await pixels([0.4, 0.7, 0.6, 1], "atomic validation");
  await page.evaluate(() => window.mutate("set"));
  await pixels([0.8, 0.9, 0.4, 1], "set / vector copy");
  await page.evaluate(() => window.mutate("replace"));
  await pixels(
    [0.8, 0.9, 0.4, 1],
    "compatible replacement keeps explicit overrides",
  );
  await page.evaluate(() => window.mutate("one"));
  await pixels([0.8, 0.25, 0.4, 1], "reset one");
  await page.evaluate(() =>
    Promise.all(
      window.renderers.map((r) => {
        r.setUniforms({ b: 0.9 });
        return r.draw();
      }),
    ),
  );
  await page.evaluate(() => window.mutate("reset"));
  await pixels([0.3, 0.25, 0.4, 1], "reset two on changed defaults");
  await page.evaluate(() => window.mutate("all"));
  await pixels([0.3, 0.25, 0.6, 1], "reset all");
  assert.deepEqual(unreferenced.custom.referenced, { glsl: [], wgsl: [] });
  await page.evaluate(
    (artifact) =>
      Promise.all(window.renderers.map((r) => r.setShader(artifact))),
    unreferenced,
  );
  await pixels(
    [0.1, 0.2, 0.3, 1],
    "declared but unreferenced fields need no GPU bindings",
  );
  await page.evaluate(
    async (artifact) =>
      Promise.all(
        window.renderers.map(async (r) => {
          r.setUniforms({ a: [0.7, 0, 0] });
          await r.setShader(artifact);
        }),
      ),
    changed,
  );
  await pixels(
    [0.7, 0.25, 0.6, 1],
    "unused declared field carries explicit override",
  );
  await page.evaluate(() =>
    Promise.all(
      window.renderers.map((r) => {
        r.resetUniforms("a");
        return r.draw();
      }),
    ),
  );
  await page.evaluate(() => window.mutate("subset"));
  await pixels([0.1, 0.2, 0.9, 1], "vec2 and vec4 packed after vec3/f32");
  await page.evaluate(() => window.mutate("incompatible"));
  await pixels([0.1, 0.2, 0.3, 1], "incompatible schema uses defaults");
  await page.evaluate(() => window.mutate("initial"));
  await pixels([0.2, 0.5, 0.6, 1], "creation override does not carry");
  const mixedBindings = await page.evaluate(
    (artifact) =>
      Promise.all(window.renderers.map((r) => r.setShader(artifact))),
    mixed,
  );
  assert.deepEqual(
    mixedBindings.map((result) => result.boundUniforms),
    [["resolution"], ["resolution"]],
  );
  await pixels(
    [0.2, 0.5, 1, 1],
    "automatic group 0 and custom group 1 coexist",
  );
  await page.evaluate(
    (artifact) =>
      Promise.all(window.renderers.map((r) => r.setShader(artifact))),
    initial,
  );
  const lifecycle = await page.evaluate(async () => {
    const both = (fn) => Promise.all(window.renderers.map(fn));
    const { initial, changed } = window.artifacts;
    const malformed = [
      {
        ...initial,
        custom: {
          ...initial.custom,
          declarations: [
            ...initial.custom.declarations,
            initial.custom.declarations[0],
          ],
        },
      },
      {
        ...initial,
        custom: {
          ...initial.custom,
          referenced: { ...initial.custom.referenced, wgsl: ["b", "a"] },
        },
      },
      {
        ...initial,
        custom: {
          ...initial.custom,
          referenced: { ...initial.custom.referenced, glsl: ["toString"] },
        },
      },
      {
        ...initial,
        custom: {
          ...initial.custom,
          declarations: [
            { ...initial.custom.declarations[0], default: [Infinity, 0, 1] },
            ...initial.custom.declarations.slice(1),
          ],
        },
      },
      {
        ...initial,
        custom: {
          ...initial.custom,
          declarations: [
            { ...initial.custom.declarations[0], default: Array(3) },
            ...initial.custom.declarations.slice(1),
          ],
        },
      },
      {
        ...initial,
        custom: {
          ...initial.custom,
          declarations: [
            { ...initial.custom.declarations[0], type: "f32" },
            ...initial.custom.declarations.slice(1),
          ],
        },
      },
      {
        ...initial,
        custom: {
          ...initial.custom,
          declarations: [
            initial.custom.declarations[0],
            { ...initial.custom.declarations[1], default: [1, 2] },
            ...initial.custom.declarations.slice(2),
          ],
        },
      },
    ];
    const invalid = await both(async (r) =>
      Promise.all(
        malformed.map((artifact) =>
          r.setShader(artifact).then(
            () => "accepted",
            (error) => error.kind,
          ),
        ),
      ),
    );
    const failed = await both(async (r, index) =>
      r
        .setShader({ ...initial, [index ? "wgsl" : "glsl"]: "broken shader" })
        .then(
          () => "accepted",
          (error) => error.kind,
        ),
    );
    const concurrent = await both(async (r) => {
      const pending = r.setShader(changed);
      r.setUniforms({ b: 0.8 });
      return pending;
    });
    return { invalid, failed, concurrent };
  });
  assert.deepEqual(lifecycle.invalid, [
    Array(7).fill("artifact"),
    Array(7).fill("artifact"),
  ]);
  assert.deepEqual(lifecycle.failed, ["shader", "shader"]);
  assert.deepEqual(
    lifecycle.concurrent.map((r) => r.status),
    ["installed", "installed"],
  );
  // WebGPU prepared asynchronously and must commit the latest host patch.
  const gpuFirst = (await presentedPixel("#gpu"))[1];
  assert.ok(Math.abs(gpuFirst - 204) <= 2, gpuFirst);
  await page.evaluate(() => Promise.all(window.renderers.map((r) => r.draw())));
  await pixels([0.3, 0.8, 0.6, 1], "pending override before commit");
  await page.evaluate(async () => {
    const { incompatible, changed } = window.artifacts;
    await Promise.all(
      window.renderers.map(async (r) => {
        r.setUniforms({ a: [0.9, 0, 0] });
        await r.setShader(incompatible);
      }),
    );
  });
  await pixels(
    [0.8, 0.2, 0.3, 1],
    "type change prunes a but carries compatible b",
  );
  await page.evaluate(async () =>
    Promise.all(
      window.renderers.map((r) => r.setShader(window.artifacts.changed)),
    ),
  );
  await pixels([0.3, 0.8, 0.6, 1], "pruned override does not reappear");
  await page.evaluate(async (artifact) => {
    await Promise.all(window.renderers.map((r) => r.setShader(artifact)));
    window.noCustom = window.renderers.map((r) => {
      try {
        r.setUniforms({ b: 0.2 });
        return "accepted";
      } catch (error) {
        return error.kind;
      }
    });
  }, plain);
  await pixels([0.1, 0.2, 0.3, 1], "replacement without custom bindings");
  assert.deepEqual(await page.evaluate(() => window.noCustom), [
    "uniform",
    "uniform",
  ]);
  await page.evaluate(
    async (artifact) =>
      Promise.all(window.renderers.map((r) => r.setShader(artifact))),
    changed,
  );
  await pixels([0.3, 0.25, 0.6, 1], "no dormant override after empty schema");
  const extraFrames = await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    let frames = 0;
    window.requestAnimationFrame = (...args) => {
      frames++;
      return original(...args);
    };
    try {
      for (const renderer of window.renderers) {
        renderer.setUniforms({ b: 0.7 });
        renderer.resetUniforms("b");
      }
      return frames;
    } finally {
      window.requestAnimationFrame = original;
    }
  });
  assert.equal(
    extraFrames,
    0,
    "manual uniform updates must not schedule draws",
  );
  const pendingReset = await page.evaluate(async () => {
    const [gl, gpu] = window.renderers;
    gpu.setUniforms({ b: 0.9 });
    const installing = gpu.setShader(window.artifacts.initial);
    gpu.resetUniforms("b");
    const result = await installing;
    gl.setUniforms({ b: 0.9 });
    gl.resetUniforms("b");
    await gl.setShader(window.artifacts.initial);
    return result.status;
  });
  assert.equal(pendingReset, "installed");
  await pixels(
    [0.2, 0.5, 0.6, 1],
    "reset during pending replacement uses new defaults",
  );
  const failedWithUpdate = await page.evaluate(async () => {
    const { initial } = window.artifacts;
    const failures = await Promise.all(
      window.renderers.map(async (r, index) => {
        const pending = r
          .setShader({
            ...initial,
            [index ? "wgsl" : "glsl"]: "invalid shader",
          })
          .then(
            () => "accepted",
            (error) => error.kind,
          );
        r.setUniforms({ b: 0.9 });
        const failure = await pending;
        await r.draw();
        return failure;
      }),
    );
    return failures;
  });
  assert.deepEqual(failedWithUpdate, ["shader", "shader"]);
  await pixels(
    [0.2, 0.9, 0.6, 1],
    "failed install preserves concurrent patch and last shader",
  );
  await page.evaluate(() =>
    Promise.all(
      window.renderers.map((r) => {
        r.resetUniforms("b");
        return r.draw();
      }),
    ),
  );
  await pixels([0.2, 0.5, 0.6, 1], "failed install retains installed defaults");
  const superseded = await page.evaluate(async () => {
    const gpu = window.renderers[1];
    const p1 = gpu.setShader(window.artifacts.initial);
    const p2 = gpu.setShader(window.artifacts.changed);
    const result = await Promise.all([p1, p2]);
    const dataAttrs = ["gl", "gpu"].map(
      (id) =>
        [...document.querySelector(`#${id}`).attributes].filter((attr) =>
          attr.name.startsWith("data-"),
        ).length,
    );
    for (const renderer of window.renderers) renderer.dispose();
    const disposed = window.renderers.map((r) => {
      try {
        r.setUniforms({ b: 0.2 });
        return "accepted";
      } catch (error) {
        return error.kind;
      }
    });
    return { result, dataAttrs, disposed };
  });
  assert.deepEqual(
    superseded.result.map((r) => r.status),
    ["superseded", "installed"],
  );
  assert.deepEqual(superseded.dataAttrs, [0, 0]);
  assert.deepEqual(superseded.disposed, ["disposed", "disposed"]);
  const creation = await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const errors = [];
    for (const [create, name] of [
      [createWebGlRenderer, "gl"],
      [createWebGpuRenderer, "gpu"],
    ]) {
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:8px;height:8px";
      document.body.append(canvas);
      for (const value of ["invalid", undefined]) {
        const failure = await create(canvas, artifact, {
          uniforms: { b: value },
          animate: false,
        }).then(
          () => "accepted",
          (error) => error.kind,
        );
        errors.push(failure);
      }
      const retry = await create(canvas, artifact, { animate: false });
      retry.dispose();
    }
    const canvas = document.createElement("canvas");
    canvas.id = "animated-uniform";
    canvas.style.cssText = "width:8px;height:8px";
    document.body.append(canvas);
    window.animatedUniform = await createWebGlRenderer(canvas, artifact);
    window.animatedUniform.setUniforms({ b: 0.8 });
    const gpuCanvas = document.createElement("canvas");
    gpuCanvas.id = "animated-uniform-gpu";
    gpuCanvas.style.cssText = "width:8px;height:8px";
    document.body.append(gpuCanvas);
    window.animatedGpuUniform = await createWebGpuRenderer(gpuCanvas, artifact);
    window.animatedGpuUniform.setUniforms({ b: 0.8 });
    return errors;
  }, initial);
  assert.deepEqual(creation, ["uniform", "uniform", "uniform", "uniform"]);
  await page.waitForFunction(() => {
    const gl = document.querySelector("#animated-uniform").getContext("webgl2");
    const value = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return Math.abs(value[1] - 204) < 3;
  });
  let animatedGpu = 0;
  for (let attempt = 0; attempt < 15; attempt++) {
    animatedGpu = (await presentedPixel("#animated-uniform-gpu"))[1];
    if (Math.abs(animatedGpu - 204) <= 2) break;
    await page.waitForTimeout(50);
  }
  assert.ok(Math.abs(animatedGpu - 204) <= 2, animatedGpu);
  await page.evaluate(() => {
    window.animatedUniform.dispose();
    window.animatedGpuUniform.dispose();
  });
  assert.deepEqual(errors, []);

  const regressionSource = (
    body,
  ) => `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});`;
  const regressions = [
    {
      name: "local identifiers, GLSL output, and WGSL fragment-position isolation",
      shader: shader(
        "vec4(café, shdr_fragment_color.y, attribute, 1)",
        regressionSource(`const shdr_coord = coord;
  const shdr_fragment_color = vec4(0.5, 1, 0, 1);
  const shdr_local_0 = shdr_fragment_color.x;
  const $color = shdr_local_0;
  const café = $color;
  const attribute = shdr_coord.x / uniforms.resolution.x;
  return BODY;`),
      ),
      expected: [0.5, 1, 0.125, 1],
    },
    {
      name: "literal-only f32 arithmetic",
      shader: shader(
        "vec4(16777217 - 16777216, 0, 0, 1)",
        regressionSource("return BODY;"),
      ),
      expected: [0, 0, 0, 1],
    },
    {
      name: "equivalent f32 arithmetic through a local",
      shader: shader(
        "vec4(a - 16777216, 0, 0, 1)",
        regressionSource("const a = 16777217;\n  return BODY;"),
      ),
      expected: [0, 0, 0, 1],
    },
  ];
  const regressionSelectors = ["#regression-gl", "#regression-gpu"];
  await page.evaluate(async (artifact) => {
    const { createWebGlRenderer } = await import("/src/webgl.ts");
    const { createWebGpuRenderer } = await import("/src/webgpu.ts");
    const canvases = ["regression-gl", "regression-gpu"].map((id) => {
      const canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.width = canvas.height = 4;
      canvas.style.cssText = "width:4px;height:4px";
      document.body.append(canvas);
      return canvas;
    });
    window.regressionRenderers = await Promise.all([
      createWebGlRenderer(canvases[0], artifact, { animate: false }),
      createWebGpuRenderer(canvases[1], artifact, { animate: false }),
    ]);
  }, regressions[0].shader);
  for (const [index, regression] of regressions.entries()) {
    if (index)
      await page.evaluate(
        (artifact) =>
          Promise.all(
            window.regressionRenderers.map((renderer) =>
              renderer.setShader(artifact),
            ),
          ),
        regression.shader,
      );
    await pixels(regression.expected, regression.name, regressionSelectors);
  }
  const special = shader(
    "vec4(uniforms.toString, uniforms.café.x, 0, 1)",
    `import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({ toString: u.f32(0.2), café: u.vec3(0.3, 0.4, 0.5) }))
.createFragmentShader(({ uniforms }) => BODY);`,
  );
  await page.evaluate(
    (artifact) =>
      Promise.all(
        window.regressionRenderers.map((renderer) =>
          renderer.setShader(artifact),
        ),
      ),
    special,
  );
  await pixels([0.2, 0.3, 0, 1], "validated schema names", regressionSelectors);
  await page.evaluate(async () => {
    await Promise.all(
      window.regressionRenderers.map(async (renderer) => {
        const values = Object.assign(Object.create(null), {
          toString: 0.8,
          café: [0.6, 0.4, 0.5],
        });
        renderer.setUniforms(values);
        await renderer.draw();
      }),
    );
  });
  await pixels([0.8, 0.6, 0, 1], "indexed schema updates", regressionSelectors);
  await page.evaluate(async () => {
    await Promise.all(
      window.regressionRenderers.map(async (renderer) => {
        renderer.resetUniforms("toString", "café");
        await renderer.draw();
      }),
    );
  });
  await pixels([0.2, 0.3, 0, 1], "indexed schema resets", regressionSelectors);
  await page.evaluate(() =>
    window.regressionRenderers.forEach((renderer) => renderer.dispose()),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Verified WebGL and presented WebGPU custom-uniform pixels, generated-name isolation, f32 arithmetic, updates, resets, replacement, validation and isolation.",
  );
} finally {
  await browser?.close();
  await server.close();
}

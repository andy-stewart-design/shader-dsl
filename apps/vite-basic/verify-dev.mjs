import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const shaderFile = fileURLToPath(
  new URL("./src/gradient.shdr.ts", import.meta.url),
);
const originalSource = await readFile(shaderFile, "utf8");
const helperShaderFile = fileURLToPath(
  new URL("./src/shared/gradient-helper.shdr.ts", import.meta.url),
);
const helperSource = await readFile(helperShaderFile, "utf8");
const alternateShaderName = "gradient-alt";
const schemaShaderFile = fileURLToPath(
  new URL("./src/shared/custom-schema.shdr.ts", import.meta.url),
);
const schemaSource = await readFile(schemaShaderFile, "utf8");
const customShaderFile = fileURLToPath(
  new URL("./src/custom-uniforms.shdr.ts", import.meta.url),
);
const customSource = await readFile(customShaderFile, "utf8");
const namedShaderFile = fileURLToPath(
  new URL("./src/custom-demo-named.shdr.ts", import.meta.url),
);
const namedSource = await readFile(namedShaderFile, "utf8");
const inlineDemoSource = await readFile(
  new URL("./src/custom-demo-inline.shdr.ts", import.meta.url),
  "utf8",
);
const originalConstructor = "vec4(uv.x, uv.y, 0, 1)";
const editedConstructor = "vec4(uv.x, uv.y, 0.25, 1)";
if (!originalSource.includes(originalConstructor)) {
  throw new Error(
    "The dev verification fixture has an unexpected shader body.",
  );
}

const server = await createServer({
  root,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
let sourceWasEdited = false;
let helperWasEdited = false;
let schemaWasEdited = false;
let customWasEdited = false;
let namedWasEdited = false;

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite did not expose a TCP development-server address.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const initialModule = await requestShaderModule(baseUrl, "initial");
  const initialAlternate = await requestShaderModule(
    baseUrl,
    "initial-alternate",
    alternateShaderName,
  );
  assertIncludes(initialAlternate, "shdr_fragment_main");
  const initialCustom = await requestShaderModule(
    baseUrl,
    "initial-custom",
    "custom-uniforms",
  );
  assertIncludes(initialCustom, "shdr_custom_0");
  assertExcludes(initialCustom, "defineUniforms");
  const namedModule = await requestShaderModule(
    baseUrl,
    "initial-named",
    "custom-demo-named",
  );
  const sharedSchemaA = await requestShaderModule(
    baseUrl,
    "initial-shared-schema-a",
    "custom-shared-a",
  );
  const sharedSchemaB = await requestShaderModule(
    baseUrl,
    "initial-shared-schema-b",
    "custom-shared-b",
  );
  assertMatches(sharedSchemaA, /"default":\s*(?:0)?\.5/);
  assertMatches(sharedSchemaB, /"default":\s*(?:0)?\.5/);
  assertIncludes(namedModule, "@group(1) @binding(0)");
  assertIncludes(namedModule, "shdr_custom_1");
  assertExcludes(namedModule, "defineUniforms");
  assertIncludes(initialModule, "export default");
  assertIncludes(initialModule, "#version 300 es");
  assertIncludes(initialModule, "shdr_fragment_color");
  assertExcludes(initialModule, "createFragmentShader");
  assertExcludes(initialModule, "coord.xy / uniforms.resolution");

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

  await page.goto(baseUrl, { waitUntil: "load" });
  await page.locator('#shader-canvas[data-render-status="success"]').waitFor();
  const browserCompile = await page.evaluate(
    async ({ source, helper }) => {
      const { compileFragmentArtifact } =
        await import("/src/browser-compiler-smoke.ts");
      const { default: staticArtifact } = await import("/src/gradient.shdr.ts");
      const graph = {
        entry: "/src/gradient.shdr.ts",
        files: {
          "/src/gradient.shdr.ts": source,
          "/src/shared/gradient-helper.shdr.ts": helper,
        },
      };
      const compiled = compileFragmentArtifact(graph);
      const invalid = source.replace(
        "vec4(uv.x, uv.y, 0, 1)",
        "vec4(coord.xy + coord.xyz)",
      );
      const failure = compileFragmentArtifact({
        ...graph,
        files: { ...graph.files, "/src/gradient.shdr.ts": invalid },
      });
      return {
        compiled,
        equal:
          compiled.ok &&
          JSON.stringify(compiled.artifact) === JSON.stringify(staticArtifact),
        failure,
        invalidExpressionStart: invalid.indexOf("coord.xy + coord.xyz"),
      };
    },
    { source: originalSource, helper: helperSource },
  );
  if (!browserCompile.equal || !browserCompile.compiled.ok) {
    throw new Error(
      "Opt-in browser compiler did not match the static Vite artifact.",
    );
  }
  if (
    browserCompile.failure.ok ||
    browserCompile.failure.diagnostics[0]?.code !== "SHDR1205" ||
    browserCompile.failure.diagnostics[0]?.range.start !==
      browserCompile.invalidExpressionStart
  ) {
    throw new Error(
      "Opt-in browser compiler did not return original-source diagnostics.",
    );
  }
  const editedHelper = helperSource.replace(
    "vec4(color.r, color.g, color.b, color.a)",
    "vec4(color.r + 0.1, color.g, color.b, color.a)",
  );
  if (editedHelper === helperSource)
    throw new Error(
      "The shared-helper fixture did not contain its edit target.",
    );
  await requestShaderModule(baseUrl, "shared-helper-gradient", "gradient");
  await requestShaderModule(
    baseUrl,
    "shared-helper-alternate",
    alternateShaderName,
  );
  await writeFile(helperShaderFile, editedHelper);
  helperWasEdited = true;
  const editedSharedEntry = await waitForShaderTransform(
    baseUrl,
    "shared-helper-gradient",
    "gradient",
    (module) => module.includes("0.1"),
  );
  const editedSharedAlternate = await waitForShaderTransform(
    baseUrl,
    "shared-helper-alternate",
    alternateShaderName,
    (module) => module.includes("0.1"),
  );
  assertIncludes(editedSharedEntry, "0.1");
  assertIncludes(editedSharedAlternate, "0.1");
  await writeFile(helperShaderFile, helperSource);
  helperWasEdited = false;

  await requestShaderModule(baseUrl, "shared-schema-a", "custom-shared-a");
  await requestShaderModule(baseUrl, "shared-schema-b", "custom-shared-b");
  const editedSchema = schemaSource.replace("u.f32(0.5)", "u.f32(0.75)");
  if (editedSchema === schemaSource)
    throw new Error(
      "The shared-schema fixture did not contain its edit target.",
    );
  await writeFile(schemaShaderFile, editedSchema);
  schemaWasEdited = true;
  await waitForShaderTransform(
    baseUrl,
    "shared-schema-a",
    "custom-shared-a",
    (module) => /"default":\s*(?:0)?\.75/.test(module),
  );
  await waitForShaderTransform(
    baseUrl,
    "shared-schema-b",
    "custom-shared-b",
    (module) => /"default":\s*(?:0)?\.75/.test(module),
  );
  await writeFile(schemaShaderFile, schemaSource);
  schemaWasEdited = false;
  await waitForShaderTransform(
    baseUrl,
    "shared-schema-a",
    "custom-shared-a",
    (module) => /"default":\s*(?:0)?\.5/.test(module),
  );
  await waitForShaderTransform(
    baseUrl,
    "shared-schema-b",
    "custom-shared-b",
    (module) => /"default":\s*(?:0)?\.5/.test(module),
  );

  const customParity = await page.evaluate(async (source) => {
    const { compileFragmentArtifact } =
      await import("/src/browser-compiler-smoke.ts");
    const { default: staticCustom } =
      await import("/src/custom-uniforms.shdr.ts");
    const compiled = compileFragmentArtifact(source);
    const invalidSource = source.replace(
      "u.f32(12)",
      "u.f32(window.devicePixelRatio)",
    );
    const invalid = compileFragmentArtifact(invalidSource);
    return {
      equal:
        compiled.ok &&
        JSON.stringify(compiled.artifact) === JSON.stringify(staticCustom),
      invalidCode: invalid.ok ? undefined : invalid.diagnostics[0]?.code,
      invalidOffset: invalid.ok
        ? undefined
        : invalid.diagnostics[0]?.range.start,
      expectedOffset: invalidSource.indexOf("window.devicePixelRatio"),
    };
  }, customSource);
  if (
    !customParity.equal ||
    customParity.invalidCode !== "SHDR1210" ||
    customParity.invalidOffset !== customParity.expectedOffset
  )
    throw new Error("Custom-uniform browser/static compilation diverged.");

  const demoParity = await page.evaluate(
    async ({ named, inline }) => {
      const { compileFragmentArtifact } =
        await import("/src/browser-compiler-smoke.ts");
      const { default: staticNamed } =
        await import("/src/custom-demo-named.shdr.ts");
      const { default: staticInline } =
        await import("/src/custom-demo-inline.shdr.ts");
      const browserNamed = compileFragmentArtifact(named);
      const browserInline = compileFragmentArtifact(inline);
      const equivalentNamed = compileFragmentArtifact(
        named
          .replace("u.vec3(0.6, 0.2, 0.4)", "u.vec3(0.2, 0.4, 0.6)")
          .replace("u.f32(0.75)", "u.f32(0.25)"),
      );
      return (
        browserNamed.ok &&
        browserInline.ok &&
        equivalentNamed.ok &&
        JSON.stringify(browserNamed.artifact) === JSON.stringify(staticNamed) &&
        JSON.stringify(browserInline.artifact) ===
          JSON.stringify(staticInline) &&
        JSON.stringify(equivalentNamed.artifact) ===
          JSON.stringify(staticInline)
      );
    },
    { named: namedSource, inline: inlineDemoSource },
  );
  if (!demoParity)
    throw new Error(
      "Inline/named custom-uniform Vite/browser artifacts differ.",
    );

  const namedReload = page.waitForEvent("framenavigated", {
    predicate: (frame) => frame === page.mainFrame(),
  });
  await writeFile(
    namedShaderFile,
    namedSource
      .replace("u.f32(0.75)", "u.f32(0.5)")
      .replace(
        "vec4(uniforms.color.x, uniforms.color.y, uniforms.gain, uniforms.color.z)",
        "vec4(uniforms.color.x, uniforms.gain, uniforms.color.y, uniforms.color.z)",
      ),
  );
  namedWasEdited = true;
  const namedEdit = await waitForNamedTransform(baseUrl);
  assertIncludes(namedEdit, "@group(1) @binding(0)");
  assertIncludes(namedEdit, "shdr_custom_1");
  assertIncludes(namedEdit, "uniform float shdr_custom_1");
  assertIncludes(namedEdit, "shdr_custom_1, shdr_custom_0.y");
  assertIncludes(
    namedEdit,
    "shdr_custom.shdr_custom_1, shdr_custom.shdr_custom_0.y",
  );
  await namedReload;
  await page
    .locator('#custom-gl-canvas[data-render-status="success"]')
    .waitFor();
  await page.getByRole("button", { name: "Use named shader" }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#custom-gl-canvas");
    const gl = canvas?.getContext("webgl2");
    if (!gl) return false;
    const rgba = new Uint8Array(4);
    gl.readPixels(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rgba,
    );
    return Math.abs(rgba[1] - 128) <= 2 && Math.abs(rgba[2] - 51) <= 2;
  });

  // This imported module triggers a full HMR navigation. Wait for it before
  // marking the page for the second edit, or a late reload can race evaluate().
  const customReload = page.waitForEvent("framenavigated", {
    predicate: (frame) => frame === page.mainFrame(),
  });
  await writeFile(
    customShaderFile,
    customSource.replace("u.f32(12)", "u.f32(24)"),
  );
  customWasEdited = true;
  const customEdit = await waitForCustomTransform(baseUrl);
  if (!/"default":\s*24/.test(customEdit))
    throw new Error("Edited custom default was not emitted.");
  assertIncludes(customEdit, "shdr_custom_0");
  await customReload;
  await page.locator('#shader-canvas[data-render-status="success"]').waitFor();

  await page.evaluate(() => {
    window.__shdrBeforeEdit = true;
  });

  await requestShaderModule(baseUrl, "edited-gradient", "gradient");
  await writeFile(
    shaderFile,
    originalSource.replace(originalConstructor, editedConstructor),
  );
  sourceWasEdited = true;

  const editedModule = await waitForEditedTransform(baseUrl);
  assertIncludes(editedModule, "0.25");
  assertExcludes(editedModule, editedConstructor);

  await page.waitForFunction(
    () =>
      window.__shdrBeforeEdit !== true &&
      document.querySelector("canvas")?.getAttribute("data-render-status") ===
        "success",
  );
  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log(
    "Verified Vite development transform, shader edit, and browser reload.",
  );
} finally {
  if (sourceWasEdited) await writeFile(shaderFile, originalSource);
  if (customWasEdited) await writeFile(customShaderFile, customSource);
  if (namedWasEdited) await writeFile(namedShaderFile, namedSource);
  if (helperWasEdited) await writeFile(helperShaderFile, helperSource);
  if (schemaWasEdited) await writeFile(schemaShaderFile, schemaSource);
  if (browser) await browser.close();
  await server.close();
}

async function requestShaderModule(baseUrl, cacheKey, shaderName = "gradient") {
  const response = await fetch(
    `${baseUrl}/src/${shaderName}.shdr.ts?t=${encodeURIComponent(cacheKey)}`,
  );
  if (!response.ok) {
    throw new Error(
      `Vite shader request failed with ${response.status}: ${await response.text()}`,
    );
  }
  return response.text();
}

async function waitForEditedTransform(baseUrl) {
  return waitForShaderTransform(
    baseUrl,
    "edited-gradient",
    "gradient",
    (module) => module.includes("0.25"),
  );
}

async function waitForShaderTransform(
  baseUrl,
  cacheKey,
  shaderName,
  predicate,
) {
  const timeoutAt = Date.now() + 5_000;
  let latest = "";
  while (Date.now() < timeoutAt) {
    latest = await requestShaderModule(baseUrl, cacheKey, shaderName);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Vite did not invalidate the ${shaderName} transform. Last response:\n${latest}`,
  );
}

async function waitForNamedTransform(baseUrl) {
  const timeoutAt = Date.now() + 5_000;
  let latest = "";
  while (Date.now() < timeoutAt) {
    latest = await requestShaderModule(
      baseUrl,
      String(Date.now()),
      "custom-demo-named",
    );
    if (/"default":\s*(?:0)?\.5/.test(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Vite did not invalidate the named custom shader transform: ${latest}`,
  );
}

async function waitForCustomTransform(baseUrl) {
  const timeoutAt = Date.now() + 5_000;
  let latest = "";
  while (Date.now() < timeoutAt) {
    latest = await requestShaderModule(
      baseUrl,
      String(Date.now()),
      "custom-uniforms",
    );
    if (/"default":\s*24/.test(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Vite did not invalidate the custom-uniform transform: ${latest}`,
  );
}

function assertIncludes(source, expected) {
  if (!source.includes(expected)) {
    throw new Error(
      `Expected response to contain ${JSON.stringify(expected)}.`,
    );
  }
}

function assertMatches(source, pattern) {
  if (!pattern.test(source)) {
    throw new Error(`Expected response to match ${pattern}.`);
  }
}

function assertExcludes(source, unexpected) {
  if (source.includes(unexpected)) {
    throw new Error(`Response contains ${JSON.stringify(unexpected)}.`);
  }
}

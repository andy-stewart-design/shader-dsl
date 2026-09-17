import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const shaderFile = fileURLToPath(
  new URL("./src/gradient.shdr.ts", import.meta.url),
);
const originalSource = await readFile(shaderFile, "utf8");
const originalConstructor = "vec4(uv.x, uv.y, 0, 1)";
const editedConstructor = "vec4(uv.x, uv.y, 0.25, 1)";
if (!originalSource.includes(originalConstructor)) {
  throw new Error("The dev verification fixture has an unexpected shader body.");
}

const server = await createServer({
  root,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
let sourceWasEdited = false;

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite did not expose a TCP development-server address.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const initialModule = await requestShaderModule(baseUrl, "initial");
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
  await page.locator('canvas[data-render-status="success"]').waitFor();
  await page.evaluate(() => {
    window.__shdrBeforeEdit = true;
  });

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
      document
        .querySelector("canvas")
        ?.getAttribute("data-render-status") === "success",
  );
  if (browserErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${browserErrors.join("\n")}`);
  }

  console.log(
    "Verified Vite development transform, shader edit, and browser reload.",
  );
} finally {
  if (sourceWasEdited) await writeFile(shaderFile, originalSource);
  if (browser) await browser.close();
  await server.close();
}

async function requestShaderModule(baseUrl, cacheKey) {
  const response = await fetch(
    `${baseUrl}/src/gradient.shdr.ts?t=${encodeURIComponent(cacheKey)}`,
  );
  if (!response.ok) {
    throw new Error(
      `Vite shader request failed with ${response.status}: ${await response.text()}`,
    );
  }
  return response.text();
}

async function waitForEditedTransform(baseUrl) {
  const timeoutAt = Date.now() + 5_000;
  let latest = "";
  while (Date.now() < timeoutAt) {
    latest = await requestShaderModule(baseUrl, String(Date.now()));
    if (latest.includes("0.25")) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Vite did not invalidate the edited shader transform. Last response:\n${latest}`,
  );
}

function assertIncludes(source, expected) {
  if (!source.includes(expected)) {
    throw new Error(`Expected response to contain ${JSON.stringify(expected)}.`);
  }
}

function assertExcludes(source, unexpected) {
  if (source.includes(unexpected)) {
    throw new Error(`Response contains ${JSON.stringify(unexpected)}.`);
  }
}

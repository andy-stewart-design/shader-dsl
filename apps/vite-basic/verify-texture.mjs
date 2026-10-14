import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { build, createServer } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const textureEntry = fileURLToPath(new URL("./texture.html", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "shdr-vite-texture-"));
let browser;
let dev;
let staticServer;

try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });

  dev = await createServer({
    root,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  await dev.listen();
  const devAddress = dev.httpServer?.address();
  if (!devAddress || typeof devAddress === "string")
    throw new Error("Vite dev server unavailable.");
  await verifyPage(
    `http://127.0.0.1:${devAddress.port}/texture.html`,
    "/abstract-01.jpg",
    "dev texture",
  );
  await dev.close();
  dev = undefined;

  staticServer = createHttpServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const prefix = ["/nested/", "/relative/"].find((value) =>
      pathname.startsWith(value),
    );
    if (!prefix) {
      response.statusCode = 404;
      response.end();
      return;
    }
    const relative = pathname.slice(prefix.length) || "texture.html";
    try {
      const body = await readFile(join(output, relative));
      const contentType =
        extname(relative) === ".js"
          ? "text/javascript"
          : extname(relative) === ".css"
            ? "text/css"
            : extname(relative) === ".png"
              ? "image/png"
              : extname(relative) === ".jpg"
                ? "image/jpeg"
                : "text/html";
      response.statusCode = 200;
      response.setHeader("content-type", contentType);
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
  const staticAddress = staticServer.address();
  if (!staticAddress || typeof staticAddress === "string")
    throw new Error("Static server unavailable.");

  await build({
    root,
    base: "/nested/",
    logLevel: "silent",
    build: {
      outDir: output,
      emptyOutDir: true,
      rollupOptions: { input: textureEntry },
    },
  });
  await assertStaticTextureBundle();
  await verifyPage(
    `http://127.0.0.1:${staticAddress.port}/nested/texture.html`,
    "/nested/abstract-01.jpg",
    "nested-base texture",
  );

  await build({
    root,
    base: "./",
    logLevel: "silent",
    build: {
      outDir: output,
      emptyOutDir: true,
      rollupOptions: { input: textureEntry },
    },
  });
  await verifyPage(
    `http://127.0.0.1:${staticAddress.port}/relative/texture.html`,
    "/relative/abstract-01.jpg",
    "relative-base texture",
  );

  console.log(
    "Verified isolated Vite texture example in dev, nested-base, and relative-base builds.",
  );
} finally {
  await browser?.close();
  await dev?.close();
  await new Promise((resolve) => {
    if (!staticServer) return resolve();
    staticServer.close(() => resolve());
  });
  await rm(output, { recursive: true, force: true });
}

async function assertStaticTextureBundle() {
  const assets = await readdir(join(output, "assets"));
  const scripts = assets.filter((name) => name.endsWith(".js"));
  const bundle = (
    await Promise.all(
      scripts.map((name) => readFile(join(output, "assets", name), "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(
    bundle,
    /compileFragmentArtifact|parseShaderFile|Babel Parser|@shdr\/core/,
    "Texture artifact bundle must not include the browser compiler.",
  );
}

async function verifyPage(url, expectedTexturePath, label) {
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/abstract-01.jpg"))
      requests.push(new URL(request.url()).pathname);
  });
  try {
    await page.goto(url, { waitUntil: "load" });
    await page
      .locator('#texture-canvas[data-render-status="success"]')
      .waitFor();
    assert.deepEqual(requests, [expectedTexturePath], `${label} URL`);
    const pixels = await page.evaluate(async (imagePath) => {
      const canvas = document.querySelector("#texture-canvas");
      const gl = canvas?.getContext("webgl2");
      if (!canvas || !gl) throw new Error("Texture WebGL context unavailable.");
      const image = new Image();
      image.src = new URL(imagePath, location.origin).href;
      await image.decode();
      const source = document.createElement("canvas");
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      const context = source.getContext("2d");
      if (!context) throw new Error("Texture source readback unavailable.");
      context.drawImage(image, 0, 0);
      const points = [
        [0.02, 0.02],
        [0.5, 0.5],
        [0.98, 0.98],
      ];
      gl.finish();
      return points.map(([x, y]) => {
        const actual = new Uint8Array(4);
        gl.readPixels(
          Math.floor(canvas.width * x),
          canvas.height - 1 - Math.floor(canvas.height * y),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          actual,
        );
        const expected = context.getImageData(
          Math.floor(source.width * x),
          Math.floor(source.height * y),
          1,
          1,
        ).data;
        return { actual: [...actual], expected: [...expected] };
      });
    }, expectedTexturePath);
    for (const [index, { actual, expected }] of pixels.entries()) {
      for (let channel = 0; channel < 3; channel++)
        assert.ok(
          Math.abs(actual[channel] - expected[channel]) <= 12,
          `${label} point ${index} channel ${channel}: ${actual} vs ${expected}`,
        );
      assert.equal(actual[3], 255, `${label} point ${index} alpha`);
    }
    assert.ok(
      pixels.some(({ expected }, index, all) =>
        all
          .slice(index + 1)
          .some(({ expected: other }) =>
            expected.some(
              (value, channel) => Math.abs(value - other[channel]) > 12,
            ),
          ),
      ),
      `${label} should contain varying image pixels, not a flat color`,
    );
  } finally {
    await page.close();
  }
}

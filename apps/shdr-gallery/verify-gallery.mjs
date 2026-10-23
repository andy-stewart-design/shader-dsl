import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.env.GALLERY_PORT ?? 4321);
const baseUrl = `http://127.0.0.1:${port}`;
const astroCommand = fileURLToPath(
  new URL(
    process.platform === "win32"
      ? "./node_modules/.bin/astro.cmd"
      : "./node_modules/.bin/astro",
    import.meta.url,
  ),
);

const server = spawn(
  astroCommand,
  ["dev", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
let backgroundServerPid;
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        const match = serverOutput.match(
          /Dev server running[^\n]*\(pid (\d+)\)/,
        );
        backgroundServerPid = match ? Number(match[1]) : undefined;
        return;
      }
    } catch {
      // Astro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Gallery dev server did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const links = page.locator("a.shader-card");
  assert.equal(
    await links.count(),
    7,
    "gallery index should list seven shaders",
  );
  const hrefs = await links.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("href")),
  );
  assert.ok(hrefs.every((href) => href?.startsWith("/shaders/")));
  await assertNoHorizontalOverflow(page, "gallery index");

  for (const href of hrefs) {
    assert.ok(href);
    await page.goto(new URL(href, baseUrl).href, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("canvas.shader-canvas").waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas.shader-canvas");
      return (
        canvas instanceof HTMLCanvasElement &&
        canvas.width > 0 &&
        canvas.height > 0 &&
        !document.querySelector('[role="alert"]')
      );
    });
    const preview = await page.locator("canvas.shader-canvas").screenshot();
    assert.ok(preview.byteLength > 500, `${href} preview should not be blank`);

    const tabs = page.getByRole("tab");
    assert.equal(await tabs.count(), 3, `${href} should have three code tabs`);
    const initialCode = page.locator('[role="tabpanel"] pre.syntax-code code');
    const initialCopyButton = page.getByRole("button", {
      name: "Copy code",
      exact: true,
    });
    assert.equal(await initialCopyButton.getAttribute("type"), "button");
    assert.ok(
      await initialCode.textContent(),
      `${href} source should be readable`,
    );

    for (const [label, marker, language] of [
      ["Shdr source", "createFragmentShader", "typescript"],
      ["Compiled GLSL", "#version 300 es", "glsl"],
      ["Compiled WGSL", "@fragment", "wgsl"],
    ]) {
      const tab = page.getByRole("tab", { name: label, exact: true });
      await tab.click();
      assert.equal(await tab.getAttribute("aria-selected"), "true");
      const panel = page.getByRole("tabpanel");
      assert.equal(
        await tab.getAttribute("aria-controls"),
        await panel.getAttribute("id"),
        `${label} tab should control the code panel`,
      );
      assert.equal(
        await panel.getAttribute("aria-labelledby"),
        await tab.getAttribute("id"),
        `${label} panel should be labelled by its tab`,
      );
      assert.match(
        await panel.textContent(),
        new RegExp(escapeRegExp(marker)),
      );
      const highlightedCode = panel.locator("pre.syntax-code");
      assert.equal(await highlightedCode.count(), 1);
      assert.equal(
        await highlightedCode.getAttribute("data-language"),
        language,
      );
      assert.ok(
        (await highlightedCode.locator('span[style*="color"]').count()) > 0,
        `${label} should contain colored syntax tokens`,
      );
    }
    await assertNoHorizontalOverflow(page, href);
  }

  if (browserErrors.length > 0) {
    throw new Error(`Gallery browser errors:\n${browserErrors.join("\n")}`);
  }
  console.log(
    "Gallery smoke check passed: seven links, seven previews, three tabs, mobile layout.",
  );
} finally {
  await browser?.close();
  if (!server.killed) server.kill("SIGTERM");
  if (backgroundServerPid) {
    try {
      process.kill(backgroundServerPid, "SIGTERM");
    } catch {
      // The Astro background process may already have exited.
    }
  }
}

async function assertNoHorizontalOverflow(page, name) {
  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) >
      window.innerWidth + 1,
  );
  assert.equal(
    overflow,
    false,
    `${name} should not overflow horizontally on mobile`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

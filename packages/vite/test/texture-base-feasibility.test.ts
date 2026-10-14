import { createServer, build } from "vite";
import { createServer as createHttpServer } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PHOTO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);
const BASES = ["/", "/nested/", "./"] as const;

describe("Vite public texture URL feasibility", () => {
  it.each(BASES)(
    "inspects dev/build public paths for base %s",
    async (base) => {
      const root = await mkdtemp(join(tmpdir(), "shdr-vite-texture-base-"));
      try {
        await mkdir(join(root, "public"), { recursive: true });
        await mkdir(join(root, "src"), { recursive: true });
        await writeFile(join(root, "public", "photo.png"), PHOTO_PNG);
        await writeFile(join(root, "src", "imported.png"), PHOTO_PNG);
        await writeFile(
          join(root, "index.html"),
          '<script type="module" src="./src/main.js"></script>',
        );
        await writeFile(
          join(root, "src", "main.js"),
          `import processedAsset from "./imported.png";
const artifact = { resources: [{ url: "/photo.png" }] };
window.__shdrTextureProbe = {
  artifact,
  processedAsset,
  base: import.meta.env.BASE_URL,
};
`,
        );

        const dev = await createServer({
          root,
          base,
          configFile: false,
          logLevel: "silent",
          server: { host: "127.0.0.1", port: 0 },
        });
        await dev.listen();
        try {
          const address = dev.httpServer?.address();
          if (!address || typeof address === "string")
            throw new Error("Vite dev server did not expose an address.");
          const origin = `http://127.0.0.1:${address.port}`;
          const devPrefix = base === "/nested/" ? "/nested/" : "/";
          expect((await fetch(`${origin}${devPrefix}photo.png`)).status).toBe(
            200,
          );
          expect((await fetch(`${origin}${devPrefix}src/main.js`)).status).toBe(
            200,
          );
          if (base === "/nested/")
            expect((await fetch(`${origin}/photo.png`)).status).toBe(404);
        } finally {
          await dev.close();
        }

        const outDir = join(root, "dist");
        await build({
          root,
          base,
          configFile: false,
          logLevel: "silent",
          build: {
            outDir,
            emptyOutDir: true,
            assetsInlineLimit: 0,
          },
        });
        const index = await readFile(join(outDir, "index.html"), "utf8");
        const scripts = await javascriptFiles(outDir);
        const bundle = scripts.join("\n");
        const assetPrefix = base === "./" ? "./assets/" : `${base}assets/`;
        expect(index).toContain(`${assetPrefix}`);
        expect(bundle).toMatch(/resources:\[\{url:[`\"]\/photo\.png[`\"]\}\]/);
        if (base === "./") {
          expect(bundle).toMatch(
            /new URL\(`imported-[^`]+\.png`,import\.meta\.url\)/,
          );
        } else {
          expect(bundle).toMatch(
            new RegExp(`${escapeRegExp(assetPrefix)}[^"']+\\.png`),
          );
        }
        expect(
          (await readFile(join(outDir, "photo.png"))).equals(PHOTO_PNG),
        ).toBe(true);

        const pagePath = base === "/" ? "/" : "/nested/";
        const deployment = await serveDirectory(outDir, pagePath);
        try {
          expect(
            (await fetch(`${deployment.origin}${pagePath}photo.png`)).status,
          ).toBe(200);
          if (base !== "/")
            expect((await fetch(`${deployment.origin}/photo.png`)).status).toBe(
              404,
            );
        } finally {
          await deployment.close();
        }

        const adapted = resolvePublicTextureUrl("/photo.png", base);
        expect(adapted).toBe(
          base === "./" ? "./photo.png" : `${base}photo.png`,
        );
        const pageUrl = `http://127.0.0.1${pagePath}`;
        expect(new URL(adapted, pageUrl).pathname).toBe(
          base === "/" ? "/photo.png" : "/nested/photo.png",
        );
        if (base !== "/")
          expect(new URL("/photo.png", pageUrl).pathname).toBe("/photo.png");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

function resolvePublicTextureUrl(
  url: string,
  base: (typeof BASES)[number],
): string {
  if (!url.startsWith("/") || /^https?:\/\//.test(url)) return url;
  return base === "./" ? `.${url}` : `${base}${url.slice(1)}`;
}

async function javascriptFiles(directory: string): Promise<string[]> {
  const entries = await readdirRecursive(directory);
  return Promise.all(
    entries
      .filter((fileName) => extname(fileName) === ".js")
      .map((fileName) => readFile(fileName, "utf8")),
  );
}

async function readdirRecursive(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const fileName = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await readdirRecursive(fileName)));
    else result.push(fileName);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function serveDirectory(
  directory: string,
  prefix: string,
): Promise<{ readonly origin: string; readonly close: () => Promise<void> }> {
  const server = createHttpServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const requested = normalize(pathname.slice(prefix.length));
    const fileName = resolve(directory, `./${requested}`);
    if (!fileName.startsWith(resolve(directory))) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(fileName);
      const contentType =
        extname(fileName) === ".png" ? "image/png" : "text/html";
      response.writeHead(200, { "content-type": contentType }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
    throw new Error("Static server did not expose an address.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      ),
  };
}

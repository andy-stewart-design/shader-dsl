import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const outputDirectory = new URL("./dist/", import.meta.url);
const files = await listFiles(outputDirectory);
const scripts = files.filter((file) => extname(file.pathname) === ".js");
if (scripts.length === 0) throw new Error("Vite emitted no JavaScript bundle.");

const bundle = (
  await Promise.all(scripts.map((file) => readFile(file, "utf8")))
).join("\n");

assertIncludes(bundle, "#version 300 es");
assertIncludes(bundle, "shdr_fragment_main");
assertIncludes(bundle, "@fragment");
assertIncludes(bundle, "shdr_fragment_color");
assertIncludes(bundle, ".xxyy");
assertIncludes(bundle, "vec3(");
assertIncludes(bundle, "smoothstep(");
assertIncludes(bundle, "shdr_custom_0");
assertIncludes(bundle, "@group(1) @binding(0)");
assertIncludes(bundle, "normalize(");
assertIncludes(bundle, "fract(");
assertExcludes(bundle, "coord.xy / uniforms.resolution");
assertExcludes(bundle, "-vec3(rgb) + vec3(1)");
assertExcludes(bundle, "const waves = sin(uv * 2) + cos(uv * 3)");
assertExcludes(bundle, "createFragmentShader");
assertExcludes(bundle, "defineUniforms");
assertExcludes(bundle, 'from "shdr"');
assertExcludes(bundle, "@babel/parser");

const maps = files.filter((file) => file.pathname.endsWith(".js.map"));
if (maps.length !== scripts.length) {
  throw new Error("Expected production source maps for all browser scripts.");
}
const sources = (
  await Promise.all(
    maps.map(async (file) => JSON.parse(await readFile(file, "utf8")).sources),
  )
).flat();
if (!sources.some((source) => source.endsWith("/src/main.ts"))) {
  throw new Error("Production source maps omitted the app's module graph.");
}
if (
  !sources.some((source) => source.endsWith("/runtime/dist/webgl.mjs")) ||
  !sources.some((source) => source.endsWith("/runtime/dist/webgpu.mjs"))
) {
  throw new Error(
    "Static dual-backend fixture did not bundle both runtime entries.",
  );
}
for (const source of sources) {
  if (
    /@babel[+/]parser|packages\/core\/|packages\/shdr\/|node_modules\/(?:@shdr\/core|shdr)\/|browser-compiler-smoke/.test(
      source,
    )
  ) {
    throw new Error(
      `Static browser bundle includes compiler/DSL module: ${source}`,
    );
  }
}

// Also prove the *one-backend* static consumer excludes the opposite runtime.
const temporary = await mkdtemp(join(tmpdir(), "shdr-static-webgl-"));
try {
  await build({
    root: fileURLToPath(new URL("./", import.meta.url)),
    logLevel: "silent",
    build: {
      lib: {
        entry: fileURLToPath(new URL("./src/webgl-only.ts", import.meta.url)),
        formats: ["es"],
        fileName: "webgl-only",
      },
      outDir: temporary,
      sourcemap: true,
      emptyOutDir: true,
    },
  });
  const oneBackend = await listFiles(pathToFileURL(`${temporary}/`));
  const oneCode = (
    await Promise.all(
      oneBackend
        .filter((file) => file.pathname.endsWith(".js"))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");
  const oneSources = (
    await Promise.all(
      oneBackend
        .filter((file) => file.pathname.endsWith(".js.map"))
        .map(async (file) => JSON.parse(await readFile(file, "utf8")).sources),
    )
  ).flat();
  assertIncludes(oneCode, "#version 300 es");
  assertExcludes(oneCode, "createFragmentShader");
  if (
    !oneSources.some((source) => source.endsWith("/runtime/dist/webgl.mjs")) ||
    oneSources.some((source) =>
      /runtime\/dist\/webgpu\.mjs|packages\/core\/|@babel[+/]parser|browser-compiler-smoke/.test(
        source,
      ),
    )
  ) {
    throw new Error(
      `Static WebGL-only module graph violated renderer/compiler boundary: ${oneSources.join(", ")}`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(
  "Verified dual/static WebGL-only artifact bundles contain no parser/compiler or unused renderer.",
);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}

function assertIncludes(source, expected) {
  if (!source.includes(expected)) {
    throw new Error(
      `Expected production bundle to contain ${JSON.stringify(expected)}.`,
    );
  }
}

function assertExcludes(source, unexpected) {
  if (source.includes(unexpected)) {
    throw new Error(
      `Production bundle contains ${JSON.stringify(unexpected)}.`,
    );
  }
}

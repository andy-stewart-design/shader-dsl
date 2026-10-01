import { readdir, readFile } from "node:fs/promises";
import { extname } from "node:path";

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
assertIncludes(bundle, "normalize(");
assertIncludes(bundle, "fract(");
assertExcludes(bundle, "coord.xy / uniforms.resolution");
assertExcludes(bundle, "-vec3(rgb) + vec3(1)");
assertExcludes(bundle, "const waves = sin(uv * 2) + cos(uv * 3)");
assertExcludes(bundle, "createFragmentShader");
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

console.log(
  "Verified production bundle contains dual-target artifact data, not the parser/compiler.",
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

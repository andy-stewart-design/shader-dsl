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
assertIncludes(bundle, "shdr_fragment_color");
assertIncludes(bundle, ".xxyy");
assertIncludes(bundle, "vec3(");
assertExcludes(bundle, "coord.xy / uniforms.resolution");
assertExcludes(bundle, "-vec3(rgb) + vec3(1)");
assertExcludes(bundle, "createFragmentShader");
assertExcludes(bundle, 'from "shdr"');

console.log("Verified production bundle contains generated GLSL only.");

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

import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { extname } from "node:path";
import { gzipSync } from "node:zlib";

const coreSourceDirectory = new URL("../../packages/core/src/", import.meta.url);
const outputDirectory = new URL("./dist/", import.meta.url);

await auditCoreBrowserBoundary();
const outputFiles = await listFiles(outputDirectory);
const scripts = outputFiles.filter((file) => extname(file.pathname) === ".js");
if (scripts.length === 0) throw new Error("The REPL emitted no JavaScript bundle.");

const scriptBuffers = await Promise.all(scripts.map((file) => readFile(file)));
const bundle = Buffer.concat(scriptBuffers).toString("utf8");
assertIncludes(bundle, "@babel/parser", "Babel Parser");
assertIncludes(bundle, "#version 300 es", "the GLSL backend");
assertIncludes(bundle, "shdr_fragment_color", "the GLSL fragment generator");
assertIncludes(bundle, "@fragment", "the WGSL backend");
assertIncludes(bundle, "shdr_fragment_main", "the WGSL fragment generator");
assertExcludes(bundle, "__vite-browser-external", "a Vite Node compatibility stub");
assertExcludes(
  bundle,
  "has been externalized for browser compatibility",
  "an externalized Node module warning",
);

const rawBytes = scriptBuffers.reduce((total, buffer) => total + buffer.length, 0);
const gzipBytes = scriptBuffers.reduce(
  (total, buffer) => total + gzipSync(buffer, { level: 9 }).length,
  0,
);
console.log("Verified @shdr/core has no Node-only source boundary.");
console.log(
  `REPL JavaScript (React, Babel Parser, core, GLSL, WGSL): ${formatBytes(rawBytes)} minified, ${formatBytes(gzipBytes)} gzip.`,
);

async function auditCoreBrowserBoundary() {
  const sourceFiles = (await listFiles(coreSourceDirectory)).filter(
    (file) => extname(file.pathname) === ".ts",
  );
  const builtins = new Set(
    builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]),
  );
  const forbiddenGlobals = /\b(?:Buffer|__dirname|__filename|process)\b/;
  const filesystemCalls =
    /\b(?:readFile|readFileSync|writeFile|writeFileSync|readdir|readdirSync|stat|statSync|open|openSync)\s*\(/;

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const specifiers = importSpecifiers(source);
    for (const specifier of specifiers) {
      const packageName = specifier.replace(/^node:/, "").split("/")[0];
      if (specifier.startsWith("node:") || builtins.has(packageName)) {
        throw new Error(
          `Node-only import ${JSON.stringify(specifier)} found in ${file.pathname}.`,
        );
      }
    }
    if (forbiddenGlobals.test(source)) {
      throw new Error(`Node-only global found in ${file.pathname}.`);
    }
    if (filesystemCalls.test(source)) {
      throw new Error(`Filesystem access found in ${file.pathname}.`);
    }
  }
}

function importSpecifiers(source) {
  const specifiers = [];
  const staticImports =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImports = /\b(?:import|require)\(\s*["']([^"']+)["']/g;
  for (const pattern of [staticImports, dynamicImports]) {
    let match;
    while ((match = pattern.exec(source))) specifiers.push(match[1]);
  }
  return specifiers;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}

function assertIncludes(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`Production bundle does not include ${label}.`);
  }
}

function assertExcludes(source, unexpected, label) {
  if (source.includes(unexpected)) {
    throw new Error(`Production bundle includes ${label}.`);
  }
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString("en-US")} B (${(bytes / 1_000).toFixed(2)} kB)`;
}

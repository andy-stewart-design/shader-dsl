import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import prettier from "prettier";
import { SHADER_BUILTINS } from "@shdr/core/browser";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = resolve(root, "docs/agent");
const sourceRoot = resolve(root, "../../packages/shdr/src");

const BUILTIN_MARKERS = {
  start: "<!-- BEGIN GENERATED BUILTIN SIGNATURES -->",
  end: "<!-- END GENERATED BUILTIN SIGNATURES -->",
} as const;
const UTILITY_MARKERS = {
  start: "<!-- BEGIN GENERATED UTILITY SIGNATURES -->",
  end: "<!-- END GENERATED UTILITY SIGNATURES -->",
} as const;

type GeneratedMarkers = typeof BUILTIN_MARKERS | typeof UTILITY_MARKERS;

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function sourceFile(fileName: string) {
  return ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function signatureOf(
  node: ts.FunctionDeclaration | ts.MethodSignature,
  file: ts.SourceFile,
): string {
  if (ts.isMethodSignature(node))
    return printer.printNode(ts.EmitHint.Unspecified, node, file);
  const declaration = ts.factory.updateFunctionDeclaration(
    node,
    node.modifiers,
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    undefined,
  );
  return printer.printNode(ts.EmitHint.Unspecified, declaration, file);
}

function exportedFunctions(file: ts.SourceFile): Map<string, string[]> {
  const functions = new Map<string, ts.FunctionDeclaration[]>();
  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    const declarations = functions.get(statement.name.text) ?? [];
    declarations.push(statement);
    functions.set(statement.name.text, declarations);
  }

  return new Map(
    [...functions].map(([name, declarations]) => {
      const overloads = declarations.filter((declaration) => !declaration.body);
      const selected =
        overloads.length > 0 ? overloads : declarations.slice(0, 1);
      return [
        name,
        selected.map((declaration) => signatureOf(declaration, file)),
      ];
    }),
  );
}

function uniformBuilderMethods(file: ts.SourceFile): string[] {
  for (const statement of file.statements) {
    if (
      !ts.isInterfaceDeclaration(statement) ||
      statement.name.text !== "UniformBuilder"
    )
      continue;
    return statement.members
      .filter(ts.isMethodSignature)
      .map((method) => signatureOf(method, file));
  }
  throw new Error(`UniformBuilder was not found in ${file.fileName}.`);
}

const mathFunctions = exportedFunctions(
  sourceFile(resolve(sourceRoot, "math.ts")),
);
const dslFunctions = exportedFunctions(
  sourceFile(resolve(sourceRoot, "dsl.ts")),
);
const builderMethods = uniformBuilderMethods(
  sourceFile(resolve(sourceRoot, "types.ts")),
);
const builtinNames = Object.keys(SHADER_BUILTINS);

for (const name of builtinNames) {
  if (!mathFunctions.has(name)) {
    throw new Error(
      `SHADER_BUILTINS includes ${name}, but math.ts has no exported function.`,
    );
  }
}

function generatedBlock(markers: GeneratedMarkers, body: string) {
  return `${markers.start}\n\n> **Generated from the public shdr source signatures; do not edit this block.**\n\n${body}\n${markers.end}`;
}

function replaceGeneratedBlock(
  content: string,
  markers: GeneratedMarkers,
  body: string,
): string {
  const generated = generatedBlock(markers, body);
  const start = content.indexOf(markers.start);
  const end = content.indexOf(markers.end);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Missing or invalid generated documentation markers: ${markers.start}`,
    );
  }
  return `${content.slice(0, start)}${generated}${content.slice(end + markers.end.length)}`;
}

async function formattedSource(source: string) {
  return prettier.format(source, { parser: "typescript" });
}

async function formattedMethods(methods: readonly string[]) {
  const source = await formattedSource(
    `interface UniformBuilder {\n${methods.join("\n")}\n}`,
  );
  return source
    .replace(/^interface UniformBuilder \{\n/, "")
    .replace(/\n\}\n$/, "");
}

const formattedBuiltinSignatures = await formattedSource(
  builtinNames.flatMap((name) => mathFunctions.get(name)!).join("\n\n"),
);
const utilityNames = [
  "sample",
  "defineShaderFunction",
  "defineUniforms",
  "createFragmentShader",
  "vec2",
  "vec3",
  "vec4",
  "mat2",
  "mat3",
  "mat4",
] as const;
for (const name of utilityNames) {
  if (!dslFunctions.has(name))
    throw new Error(`dsl.ts has no ${name} declaration.`);
}

const utilitySignatures = [
  "### DSL entry points",
  "",
  "```ts",
  await formattedSource(
    utilityNames.flatMap((name) => dslFunctions.get(name)!).join("\n\n"),
  ),
  "```",
  "",
  "### UniformBuilder methods",
  "",
  "```ts",
  await formattedMethods(builderMethods),
  "```",
].join("\n");

const files = [
  {
    file: resolve(docs, "builtins.md"),
    markers: BUILTIN_MARKERS,
    body: `\`\`\`ts\n${formattedBuiltinSignatures}\`\`\``,
  },
  {
    file: resolve(docs, "utilities.md"),
    markers: UTILITY_MARKERS,
    body: utilitySignatures,
  },
] as const;

async function main() {
  const check = process.argv.includes("--check");
  const updates = files.map(({ file, markers, body }) => {
    const current = readFileSync(file, "utf8");
    return {
      file,
      current,
      expected: replaceGeneratedBlock(current, markers, body),
    };
  });
  const stale = updates.filter(({ current, expected }) => current !== expected);

  if (check) {
    if (stale.length > 0) {
      throw new Error(
        `Documentation signatures are out of date. Run "pnpm generate-doc-signatures" in apps/repl-web.\n- ${stale.map(({ file }) => file).join("\n- ")}`,
      );
    }
    console.log("Documentation signatures are up to date.");
    return;
  }

  for (const { file, current, expected } of updates) {
    if (current !== expected) writeFileSync(file, expected);
  }
  console.log(`Generated signatures in ${updates.length} documentation files.`);
}

main();

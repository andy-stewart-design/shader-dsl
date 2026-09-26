import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { languageServicePackageName } from "@shdr/language-service";
import oniguruma from "vscode-oniguruma";
import textmate from "vscode-textmate";

const { loadWASM, OnigScanner, OnigString } = oniguruma;
const { INITIAL, parseRawGrammar, Registry } = textmate;

test("editor fixture dependencies resolve", () => {
  assert.equal(languageServicePackageName, "@shdr/language-service");
});

const directory = fileURLToPath(new URL(".", import.meta.url));
const vsCodeContents = process.env.VSCODE_EXECUTABLE_PATH
  ? dirname(dirname(process.env.VSCODE_EXECUTABLE_PATH))
  : "/Applications/Visual Studio Code.app/Contents";
const vsCodeTypeScriptGrammar = join(
  vsCodeContents,
  "Resources/app/extensions/typescript-basics/syntaxes/TypeScript.tmLanguage.json",
);

test("Shdr grammar is contributed to its dedicated language ID", async () => {
  const manifest = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  const grammar = manifest.contributes.grammars.find(
    (entry) => entry.language === "shdr-typescript",
  );
  assert.deepEqual(grammar, {
    language: "shdr-typescript",
    scopeName: "source.shdr.ts",
    path: "./syntaxes/shdr-typescript.tmLanguage.json",
  });
  const source = JSON.parse(
    await readFile(join(directory, grammar.path), "utf8"),
  );
  assert.equal(source.scopeName, grammar.scopeName);
  assert.deepEqual(source.patterns, [{ include: "source.ts" }]);
});

test("Shdr source receives built-in TypeScript lexical scopes", async (t) => {
  if (!existsSync(vsCodeTypeScriptGrammar)) {
    t.skip("Requires locally installed VS Code TypeScript grammar");
    return;
  }
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
  await loadWASM(await readFile(wasmPath));
  const grammarPath = join(
    directory,
    "syntaxes/shdr-typescript.tmLanguage.json",
  );
  const grammarText = await readFile(grammarPath, "utf8");
  const tsText = await readFile(vsCodeTypeScriptGrammar, "utf8");
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (source) => new OnigString(source),
    }),
    loadGrammar: (scope) => {
      if (scope === "source.shdr.ts")
        return parseRawGrammar(grammarText, grammarPath);
      if (scope === "source.ts")
        return parseRawGrammar(tsText, vsCodeTypeScriptGrammar);
      return null;
    },
  });
  const grammar = await registry.loadGrammar("source.shdr.ts");
  assert(grammar);
  let stack = INITIAL;
  const scopes = [];
  for (const line of (
    await readFile(join(directory, "expanded.shdr.ts"), "utf8")
  ).split("\n")) {
    const result = grammar.tokenizeLine(line, stack);
    scopes.push(
      ...result.tokens.map((token) => ({
        word: line.slice(token.startIndex, token.endIndex),
        scopes: token.scopes,
      })),
    );
    stack = result.ruleStack;
  }
  for (const [word, category] of [
    ["import", "keyword"],
    ["const", "storage"],
    ["shdr", "string"],
    ["5", "constant.numeric"],
  ]) {
    assert(
      scopes.some(
        (token) =>
          token.word.includes(word) &&
          token.scopes.some((scope) => scope.includes(category)),
      ),
      `Expected ${word} to receive a ${category} TypeScript scope`,
    );
  }
  assert(scopes.some((token) => token.scopes[0] === "source.shdr.ts"));
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { languageServicePackageName } = require("@shdr/language-service");

test("editor fixture dependencies resolve", () => {
  assert.equal(languageServicePackageName, "@shdr/language-service");
});

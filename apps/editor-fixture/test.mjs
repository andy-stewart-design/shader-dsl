import assert from "node:assert/strict";
import test from "node:test";

import { languageServicePackageName } from "@shdr/language-service";

test("editor fixture dependencies resolve", () => {
  assert.equal(languageServicePackageName, "@shdr/language-service");
});

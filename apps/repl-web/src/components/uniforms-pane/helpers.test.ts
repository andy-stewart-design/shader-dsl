import assert from "node:assert/strict";
import test from "node:test";
import { createUniform } from "./helpers.ts";

test("creates value-prefixed default names", () => {
  assert.equal(createUniform("uniform-0", 0).name, "value_1");
  assert.equal(createUniform("uniform-1", 1).name, "value_2");
});

test("skips default names used by existing uniforms", () => {
  assert.equal(
    createUniform("uniform-1", 0, ["value_1", " value_2 "]).name,
    "value_3",
  );
});

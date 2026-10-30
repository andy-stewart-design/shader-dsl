import assert from "node:assert/strict";
import test from "node:test";
import { createUniform } from "./helpers.ts";
import { toShaderUniformDefinitions } from "./definitions.ts";
import type { Uniform } from "./types.ts";

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

test("converts float and color drafts to shader defaults", () => {
  const uniforms: Uniform[] = [
    {
      id: "float",
      name: "gain",
      type: "float",
      float: { value: "0.5", min: "100", max: "-100" },
      color: { draft: "#000000", valid: "#000000" },
    },
    {
      id: "color",
      name: "tint",
      type: "color",
      float: { value: "0", min: "-1", max: "1" },
      color: { draft: "#0f8", valid: "#0f8" },
    },
  ];
  assert.deepEqual(toShaderUniformDefinitions(uniforms), {
    ok: true,
    definitions: [
      { name: "gain", type: "f32", default: 0.5 },
      { name: "tint", type: "vec3", default: [0 / 255, 255 / 255, 136 / 255] },
    ],
  });
});

test("rejects invalid names, reserved names, drafts, and f32 overflow", () => {
  const base: Uniform = {
    id: "uniform",
    name: "gain",
    type: "float",
    float: { value: "0", min: "-1", max: "1" },
    color: { draft: "#000000", valid: "#000000" },
  };
  for (const name of ["resolution", "__proto__", "not-valid"]) {
    const result = toShaderUniformDefinitions([{ ...base, name }]);
    assert.equal(result.ok, false);
  }
  assert.equal(
    toShaderUniformDefinitions([
      { ...base, float: { ...base.float, value: "1e300" } },
    ]).ok,
    false,
  );
  assert.equal(
    toShaderUniformDefinitions([
      { ...base, type: "color", color: { draft: "#12", valid: "#123456" } },
    ]).ok,
    false,
  );
});

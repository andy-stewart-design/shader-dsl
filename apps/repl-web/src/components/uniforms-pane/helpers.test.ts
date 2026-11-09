import assert from "node:assert/strict";
import test from "node:test";
import { createUniform, changeUniformType } from "./helpers.ts";
import { toShaderUniformDefinitions } from "./definitions.ts";
import type { Uniform } from "../../shared/uniforms.ts";

test("creates flattened float defaults and value-prefixed names", () => {
  assert.deepEqual(createUniform("uniform-0", 0), {
    id: "uniform-0",
    name: "value_1",
    type: "float",
    value: "0",
    min: "-1",
    max: "1",
  });
  assert.equal(createUniform("uniform-1", 1).name, "value_2");
});

test("skips default names used by existing uniforms", () => {
  assert.equal(
    createUniform("uniform-1", 0, ["value_1", " value_2 "]).name,
    "value_3",
  );
});

test("switching types preserves identity and name but resets the variant", () => {
  const float: Uniform = {
    id: "uniform",
    name: "gain",
    type: "float",
    value: "0.5",
    min: "100",
    max: "200",
  };
  const color = changeUniformType(float, "color");
  assert.deepEqual(color, {
    id: "uniform",
    name: "gain",
    type: "color",
    draft: "#85befd",
    valid: "#85befd",
  });
  assert.deepEqual(changeUniformType(color, "float"), {
    id: "uniform",
    name: "gain",
    type: "float",
    value: "0",
    min: "-1",
    max: "1",
  });
  assert.equal(changeUniformType(float, "float"), float);
});

test("converts float and color drafts to shader defaults", () => {
  const uniforms: Uniform[] = [
    {
      id: "float",
      name: "gain",
      type: "float",
      value: "0.5",
      min: "0",
      max: "1",
    },
    {
      id: "color",
      name: "tint",
      type: "color",
      draft: "#0f8",
      valid: "#0f8",
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
    value: "0",
    min: "-1",
    max: "1",
  };
  for (const name of ["resolution", "__proto__", "not-valid"]) {
    const result = toShaderUniformDefinitions([{ ...base, name }]);
    assert.equal(result.ok, false);
  }
  assert.equal(
    toShaderUniformDefinitions([{ ...base, value: "1e300" }]).ok,
    false,
  );
  assert.equal(
    toShaderUniformDefinitions([
      { id: "color", name: "tint", type: "color", draft: "#12", valid: "#123456" },
    ]).ok,
    false,
  );
});

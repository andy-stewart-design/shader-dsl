import assert from "node:assert/strict";
import test from "node:test";
import { cloneUniforms, type Uniform } from "./uniforms.ts";

test("cloneUniforms copies flattened uniform fields", () => {
  const uniforms: Uniform[] = [
    {
      id: "float",
      name: "gain",
      type: "float",
      value: "0",
      min: "-1",
      max: "1",
    },
    {
      id: "color",
      name: "tint",
      type: "color",
      draft: "#123456",
      valid: "#123456",
    },
  ];
  const snapshot = cloneUniforms(uniforms);

  assert.notEqual(snapshot, uniforms);
  assert.notEqual(snapshot[0], uniforms[0]);
  assert.notEqual(snapshot[1], uniforms[1]);
  assert.deepEqual(snapshot, uniforms);

  const float = uniforms[0];
  const color = uniforms[1];
  const floatSnapshot = snapshot[0];
  const colorSnapshot = snapshot[1];
  if (float.type !== "float" || color.type !== "color") throw new Error();
  if (floatSnapshot.type !== "float" || colorSnapshot.type !== "color") {
    throw new Error();
  }

  float.value = "1";
  color.valid = "#ffffff";
  assert.equal(floatSnapshot.value, "0");
  assert.equal(colorSnapshot.valid, "#123456");

  floatSnapshot.min = "-2";
  colorSnapshot.draft = "#fedcba";
  assert.equal(float.min, "-1");
  assert.equal(color.draft, "#123456");
});

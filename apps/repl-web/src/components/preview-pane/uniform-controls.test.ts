import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultRuntimeValues,
  runtimeValuesToPatch,
  toRuntimeUniforms,
} from "./uniform-controls.ts";
import type { Uniform } from "../uniforms-pane/types";

const float: Uniform = {
  id: "float",
  name: "gain",
  type: "float",
  float: { value: "0.5", min: "-2", max: "2" },
  color: { draft: "#000000", valid: "#000000" },
};

const color: Uniform = {
  id: "color",
  name: "tint",
  type: "color",
  float: { value: "0", min: "-1", max: "1" },
  color: { draft: "#0f8", valid: "#0f8" },
};

test("runtime controls use applied defaults and metadata", () => {
  const controls = toRuntimeUniforms([float, color]);
  assert.deepEqual(controls, [
    { name: "gain", type: "float", defaultValue: 0.5, min: -2, max: 2 },
    { name: "tint", type: "color", defaultValue: "#00ff88" },
  ]);
  assert.deepEqual(defaultRuntimeValues(controls), {
    gain: 0.5,
    tint: "#00ff88",
  });
});

test("invalid float ranges fall back without producing NaN patches", () => {
  const controls = toRuntimeUniforms([
    { ...float, float: { ...float.float, min: "bad", max: "bad" } },
  ]);
  assert.equal(controls.length, 1);
  const [control] = controls;
  assert.equal(control?.type, "float");
  if (control?.type !== "float") return;
  assert.ok(Number.isFinite(control.min));
  assert.ok(Number.isFinite(control.max));
  assert.deepEqual(runtimeValuesToPatch(controls, { gain: 0.75 }), {
    gain: 0.75,
  });
});

test("fallback ranges stay within finite f32 for both signs", () => {
  const largestF32 = Math.fround(3.4028234663852886e38);
  const controls = toRuntimeUniforms([
    { ...float, float: { value: String(largestF32), min: "bad", max: "bad" } },
    {
      ...float,
      id: "negative-float",
      name: "loss",
      float: { value: String(-largestF32), min: "bad", max: "bad" },
    },
  ]);

  for (const control of controls) {
    assert.equal(control.type, "float");
    if (control.type !== "float") continue;
    assert.ok(Number.isFinite(Math.fround(control.min)));
    assert.ok(Number.isFinite(Math.fround(control.max)));
    assert.ok(control.min < control.max);
  }
  assert.deepEqual(
    runtimeValuesToPatch(controls, { gain: largestF32, loss: -largestF32 }),
    { gain: largestF32, loss: -largestF32 },
  );
});

test("float patches reject values that overflow f32", () => {
  const controls = toRuntimeUniforms([float]);
  assert.deepEqual(runtimeValuesToPatch(controls, { gain: Number.MAX_VALUE }), {});
  assert.deepEqual(runtimeValuesToPatch(controls, { gain: -Number.MAX_VALUE }), {});
});

test("runtime colors become vec3 patches", () => {
  const controls = toRuntimeUniforms([color]);
  assert.deepEqual(runtimeValuesToPatch(controls, { tint: "#123456" }), {
    tint: [0x12 / 255, 0x34 / 255, 0x56 / 255],
  });
});

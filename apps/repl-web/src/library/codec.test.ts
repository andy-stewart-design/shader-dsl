import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSketch, encodeSketch, type SketchSnapshot } from "./codec.ts";

const snapshot: SketchSnapshot = {
  name: "  Same name  ",
  main: "unfinished(\n",
  utils: "// utils\n",
  uniforms: [
    { id: "a", name: "", type: "float", value: "-", min: "", max: "1e" },
    { id: "b", name: "tint", type: "color", draft: "#f", valid: "#ABCDEF" },
  ],
};

test("v1 round trips raw ordered inputs without local metadata", () => {
  const text = encodeSketch({
    ...snapshot,
    id: "local-id",
    savedAt: 123,
  } as SketchSnapshot);
  assert.deepEqual(decodeSketch(text), snapshot);
  assert.deepEqual(Object.keys(JSON.parse(text)), [
    "format",
    "version",
    "name",
    "main",
    "utils",
    "uniforms",
  ]);
});

test("rejects malformed, unsupported, and invalid files", () => {
  const file = JSON.parse(encodeSketch(snapshot));
  assert.throws(() => decodeSketch("{"));
  assert.throws(() => decodeSketch(JSON.stringify({ ...file, version: 2 })));
  assert.throws(() => decodeSketch(JSON.stringify({ ...file, name: "  " })));
  assert.throws(() =>
    decodeSketch(
      JSON.stringify({
        ...file,
        uniforms: [file.uniforms[0], file.uniforms[0]],
      }),
    ),
  );
  assert.throws(() =>
    decodeSketch(
      JSON.stringify({
        ...file,
        uniforms: [{ ...file.uniforms[1], valid: "#f" }],
      }),
    ),
  );
  assert.throws(() =>
    decodeSketch(
      JSON.stringify({ ...file, uniforms: [{ ...file.uniforms[0], min: 0 }] }),
    ),
  );
});

import { expect, it } from "vitest";

import {
  createVirtualSource,
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
} from "../src/index.js";

function shader(expression: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const value = ${expression};
  return vec4(value, coord.x, 0, 1);
});`;
}

it("tracks nested unary and binary operations and copied numeric literal positions", () => {
  const expression = "-1 / (2 + -uniforms.time)";
  const source = shader(expression);
  const result = createVirtualSource(source);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const virtual = result.virtualSource;
  expect(virtual.code).toContain("__shdr_internal_div(");
  expect(virtual.code).toContain("__shdr_internal_add(");
  expect(virtual.code.match(/__shdr_internal_neg\(/g)).toHaveLength(2);
  expect(virtual.operations.map((op) => op.kind)).toEqual([
    "unary-operation",
    "unary-operation",
    "binary-operation",
    "binary-operation",
  ]);
  for (const operation of virtual.operations) {
    expect(mapGeneratedRangeToOriginal(virtual, operation.generated)).toEqual(
      operation.original,
    );
    expect(operation.original.length).toBeGreaterThan(0);
  }

  const one = source.indexOf("-1 / ") + 1;
  const mapped = mapOriginalOffsetToGenerated(virtual, one);
  expect(mapped).toBeDefined();
  expect(virtual.code[mapped!]).toBe("1");
  expect(
    mapGeneratedRangeToOriginal(virtual, { start: mapped!, length: 1 }),
  ).toEqual({ start: one, length: 1 });
  const unary = virtual.operations.filter(
    (op) => op.kind === "unary-operation",
  );
  expect(
    unary.map((op) =>
      source.slice(op.original.start, op.original.start + op.original.length),
    ),
  ).toEqual(["-1", "-uniforms.time"]);
});

it("retains left association and explicit parentheses when mixing operators", () => {
  const expression = "uniforms.time - uniforms.time / (1 + 2) * 3";
  const result = createVirtualSource(shader(expression));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const code = result.virtualSource.code;
  expect(code).toContain("__shdr_internal_sub(");
  expect(code).toContain("__shdr_internal_div(");
  expect(code).toContain("__shdr_internal_mul(");
  expect(code).toMatch(
    /__shdr_internal_sub\(uniforms\.time, __shdr_internal_mul\(__shdr_internal_div\(/,
  );
});

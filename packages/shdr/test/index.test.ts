import { describe, expect, it } from "vitest";

import * as shdr from "../src/index.js";
import { createFragmentShader, shdrPackageName, vec4 } from "../src/index.js";
import { __shdr_internal_div, __shdr_internal_f32 } from "../src/internal.js";
import type { Expr, F32, Vec4 } from "../src/types.js";

const scalar = {} as Expr<F32>;
const vector4 = {} as Expr<Vec4<F32>>;

describe("shdr package", () => {
  it("exports its package marker", () => {
    expect(shdrPackageName).toBe("shdr");
  });

  it("does not export internal helpers from the public entry point", () => {
    expect(shdr).not.toHaveProperty("__shdr_internal_f32");
    expect(shdr).not.toHaveProperty("__shdr_internal_div");
  });

  it.each([
    ["createFragmentShader", () => createFragmentShader(() => vector4)],
    ["vec4", () => vec4(scalar, scalar, scalar, scalar)],
    ["__shdr_internal_f32", () => __shdr_internal_f32(1)],
    ["__shdr_internal_div", () => __shdr_internal_div(scalar, scalar)],
  ])("throws when %s reaches runtime", (apiName, invoke) => {
    expect(invoke).toThrow(
      `shdr: ${apiName}() cannot run because the shader source was not transformed.`,
    );
  });
});

import { expect, it } from "vitest";
import { evaluateShaderComponents } from "../src/evaluate-shader-constant.js";
import { lowerFragment } from "../src/index.js";

it("does not fabricate componentwise constants for matrix-involved products", () => {
  const source = `import { createFragmentShader, mat2, sqrt, vec2, vec4 } from "shdr";
export default createFragmentShader(() => {
  const product = mat2(-1, 0, 0, -1) * vec2(-1, -1);
  const matrixProduct = mat2(-1, 0, 0, -1) * mat2(-1, 0, 0, -1);
  const guarded = sqrt(product);
  return vec4(guarded, 0, 1);
});`;
  const lowered = lowerFragment(source);
  expect(lowered.ok, JSON.stringify(lowered)).toBe(true);
  if (!lowered.ok) return;

  const product = lowered.ir.statements.find(
    (statement) =>
      statement.kind === "const-declaration" && statement.name === "product",
  );
  const matrixProduct = lowered.ir.statements.find(
    (statement) =>
      statement.kind === "const-declaration" &&
      statement.name === "matrixProduct",
  );
  expect(product?.kind).toBe("const-declaration");
  expect(matrixProduct?.kind).toBe("const-declaration");
  if (
    product?.kind !== "const-declaration" ||
    matrixProduct?.kind !== "const-declaration"
  )
    return;
  expect(evaluateShaderComponents(product.initializer, new Map())).toEqual([
    undefined,
    undefined,
  ]);
  expect(
    evaluateShaderComponents(matrixProduct.initializer, new Map()),
  ).toEqual([undefined, undefined, undefined, undefined]);
});

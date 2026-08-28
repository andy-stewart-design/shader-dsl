import { describe, expect, it } from "vitest";

import {
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  parseShaderFile,
  type ShaderDivisionExpressionSyntax,
  type ShaderExpressionSyntax,
  type TextRange,
} from "../src/index.js";
import { transformShaderExpressions } from "../src/transform-shader-expressions.js";
import { readShaderFixture } from "./read-shader-fixture.js";

const divHelper = "__shdr_internal_div";
const f32Helper = "__shdr_internal_f32";
const helperImport = `import { ${divHelper}, ${f32Helper} } from "shdr/internal";\n`;

function expectDivision(
  expression: ShaderExpressionSyntax,
): ShaderDivisionExpressionSyntax {
  expect(expression.kind).toBe("division-expression");
  if (expression.kind !== "division-expression") {
    throw new Error("Expected a normalized division expression.");
  }
  return expression;
}

function helperCallRanges(code: string, helperName: string): TextRange[] {
  const ranges: TextRange[] = [];
  let searchFrom = 0;

  while (true) {
    const start = code.indexOf(`${helperName}(`, searchFrom);
    if (start < 0) return ranges;

    const openParenthesis = start + helperName.length;
    let depth = 0;
    let end = openParenthesis;
    for (; end < code.length; end += 1) {
      const character = code[end];
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (depth === 0) break;
    }

    ranges.push({ start, length: end - start + 1 });
    searchFrom = openParenthesis + 1;
  }
}

function slashOffsets(source: string, expression: TextRange): number[] {
  const offsets: number[] = [];
  const end = expression.start + expression.length;

  for (let offset = expression.start; offset < end; offset += 1) {
    if (source[offset] === "/") offsets.push(offset);
  }

  return offsets;
}

describe("nested division transformation", () => {
  it("preserves left associativity and explicit right-hand parentheses", async () => {
    const source = await readShaderFixture("nested-division");
    const parsed = parseShaderFile(source, "nested-division.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);

    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const expected = `${helperImport}import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const left = ${divHelper}(${divHelper}(coord.xy, uniforms.resolution), uniforms.time);
  const right = ${divHelper}(coord.xy, (${divHelper}(uniforms.resolution, uniforms.time)));
  // prettier-ignore
  const half = ${divHelper}((${divHelper}(${f32Helper}(1), ${f32Helper}(2))), uniforms.time);

  return vec4(left.x, right.y, half, ${f32Helper}(1));
});
`;

    expect(virtualSource.code).toBe(expected);
  });

  it("maps every inner and outer helper call to its own source expression", async () => {
    const source = await readShaderFixture("nested-division");
    const parsed = parseShaderFile(source, "nested-mappings.shdr.ts");
    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const [leftDeclaration, rightDeclaration, halfDeclaration] =
      parsed.info!.callback.syntax.declarations;

    const leftOuter = expectDivision(leftDeclaration!.initializer);
    const leftInner = expectDivision(leftOuter.left);
    const rightOuter = expectDivision(rightDeclaration!.initializer);
    expect(rightOuter.right.kind).toBe("parenthesized-expression");
    if (rightOuter.right.kind !== "parenthesized-expression") return;
    const rightInner = expectDivision(rightOuter.right.expression);
    const halfOuter = expectDivision(halfDeclaration!.initializer);
    expect(halfOuter.left.kind).toBe("parenthesized-expression");
    if (halfOuter.left.kind !== "parenthesized-expression") return;
    const halfInner = expectDivision(halfOuter.left.expression);

    const generatedDivisions = helperCallRanges(virtualSource.code, divHelper);
    const originalDivisions = [
      leftOuter.range,
      leftInner.range,
      rightOuter.range,
      rightInner.range,
      halfOuter.range,
      halfInner.range,
    ];

    expect(generatedDivisions).toHaveLength(originalDivisions.length);
    for (const [index, generated] of generatedDivisions.entries()) {
      expect(mapGeneratedRangeToOriginal(virtualSource, generated)).toEqual(
        originalDivisions[index],
      );
      expect(
        mapGeneratedRangeToOriginal(virtualSource, {
          start: generated.start,
          length: divHelper.length,
        }),
      ).toEqual(originalDivisions[index]);
    }

    const [leftFirstSlash, leftSecondSlash] = slashOffsets(
      source,
      leftOuter.range,
    );
    expect(mapOriginalOffsetToGenerated(virtualSource, leftFirstSlash!)).toBe(
      generatedDivisions[1]!.start,
    );
    expect(mapOriginalOffsetToGenerated(virtualSource, leftSecondSlash!)).toBe(
      generatedDivisions[0]!.start,
    );

    const [rightFirstSlash, rightSecondSlash] = slashOffsets(
      source,
      rightOuter.range,
    );
    expect(mapOriginalOffsetToGenerated(virtualSource, rightFirstSlash!)).toBe(
      generatedDivisions[2]!.start,
    );
    expect(mapOriginalOffsetToGenerated(virtualSource, rightSecondSlash!)).toBe(
      generatedDivisions[3]!.start,
    );

    const [halfFirstSlash, halfSecondSlash] = slashOffsets(
      source,
      halfOuter.range,
    );
    expect(mapOriginalOffsetToGenerated(virtualSource, halfFirstSlash!)).toBe(
      generatedDivisions[5]!.start,
    );
    expect(mapOriginalOffsetToGenerated(virtualSource, halfSecondSlash!)).toBe(
      generatedDivisions[4]!.start,
    );
  });

  it("maps numeric wrappers nested inside division independently", async () => {
    const source = await readShaderFixture("nested-division");
    const parsed = parseShaderFile(source, "nested-numerics.shdr.ts");
    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const half = parsed.info!.callback.syntax.declarations[2]!.initializer;
    const halfOuter = expectDivision(half);
    if (halfOuter.left.kind !== "parenthesized-expression") {
      throw new Error("Expected a parenthesized numeric division.");
    }
    const halfInner = expectDivision(halfOuter.left.expression);
    if (
      halfInner.left.kind !== "numeric-literal" ||
      halfInner.right.kind !== "numeric-literal"
    ) {
      throw new Error("Expected numeric division operands.");
    }

    const returnExpression = parsed.info!.callback.syntax.returnExpression;
    if (returnExpression.kind !== "constructor-call") {
      throw new Error("Expected the final vec4 constructor call.");
    }
    const returnLiteral = returnExpression.arguments[3]!;
    if (returnLiteral.kind !== "numeric-literal") {
      throw new Error("Expected a numeric final argument.");
    }

    const generatedNumerics = helperCallRanges(virtualSource.code, f32Helper);
    const originalNumerics = [
      halfInner.left.range,
      halfInner.right.range,
      returnLiteral.range,
    ];

    expect(generatedNumerics).toHaveLength(originalNumerics.length);
    for (const [index, generated] of generatedNumerics.entries()) {
      expect(mapGeneratedRangeToOriginal(virtualSource, generated)).toEqual(
        originalNumerics[index],
      );
    }
  });
});

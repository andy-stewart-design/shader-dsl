import { describe, expect, it } from "vitest";

import {
  MappedTextWriter,
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  type TextRange,
} from "../src/index.js";

const range = (start: number, length: number): TextRange => ({ start, length });

describe("MappedTextWriter", () => {
  it("creates an exact identity mapping for copied source", () => {
    const writer = new MappedTextWriter("abc");

    expect(writer.copy(range(0, 3))).toEqual(range(0, 3));

    const result = writer.finish(range(0, 3));
    expect(result).toEqual({
      code: "abc",
      mappings: [
        {
          original: range(0, 3),
          generated: range(0, 3),
          kind: "identity",
        },
      ],
      operations: [],
      shaderRegion: range(0, 3),
    });
    expect(mapOriginalOffsetToGenerated(result, 1)).toBe(1);
    expect(mapGeneratedRangeToOriginal(result, range(1, 1))).toEqual(
      range(1, 1),
    );
  });

  it("accounts for an unmapped generated prefix before copied source", () => {
    const writer = new MappedTextWriter("abc");
    writer.append("pre");
    writer.copy(range(0, 3));

    const result = writer.finish(range(0, 3));
    expect(result.code).toBe("preabc");
    expect(mapOriginalOffsetToGenerated(result, 1)).toBe(4);
    expect(mapGeneratedRangeToOriginal(result, range(4, 1))).toEqual(
      range(1, 1),
    );
  });

  it("maps a generated wrapper to its complete original expression", () => {
    const writer = new MappedTextWriter("abc");
    writer.writeExpression(range(0, 3), (expression) => {
      expression.append("wrap(");
      expression.copy(range(0, 3));
      expression.append(")");
    });

    const result = writer.finish(range(0, 3));
    expect(result.code).toBe("wrap(abc)");
    expect(mapGeneratedRangeToOriginal(result, range(0, 4))).toEqual(
      range(0, 3),
    );
    expect(mapGeneratedRangeToOriginal(result, range(6, 1))).toEqual(
      range(1, 1),
    );
  });

  it("selects the smallest containing expression mapping when mappings nest", () => {
    const source = "a / b / c";
    const writer = new MappedTextWriter(source);

    writer.writeExpression(range(0, 9), (outer) => {
      outer.append("div(");
      outer.writeExpression(range(0, 5), (inner) => {
        inner.append("div(");
        inner.copy(range(0, 1));
        inner.append(",");
        inner.copy(range(4, 1));
        inner.append(")");
      });
      outer.append(",");
      outer.copy(range(8, 1));
      outer.append(")");
    });

    const result = writer.finish(range(0, 9));
    expect(result.code).toBe("div(div(a,b),c)");

    expect(mapGeneratedRangeToOriginal(result, range(0, 3))).toEqual(
      range(0, 9),
    );
    expect(mapGeneratedRangeToOriginal(result, range(4, 3))).toEqual(
      range(0, 5),
    );
    expect(mapGeneratedRangeToOriginal(result, range(10, 1))).toEqual(
      range(4, 1),
    );
    expect(mapOriginalOffsetToGenerated(result, 2)).toBe(4);
    expect(mapOriginalOffsetToGenerated(result, 4)).toBe(10);
    expect(mapOriginalOffsetToGenerated(result, 6)).toBe(0);
  });

  it("prefers identity mappings over equal-range expression mappings", () => {
    const writer = new MappedTextWriter("abc");
    const generated = writer.copy(range(0, 3));
    writer.addExpressionMapping(range(0, 3), generated);

    const result = writer.finish(range(0, 3));
    expect(mapGeneratedRangeToOriginal(result, range(1, 1))).toEqual(
      range(1, 1),
    );
    expect(mapOriginalOffsetToGenerated(result, 1)).toBe(1);
  });

  it("returns undefined for unmapped generated text", () => {
    const writer = new MappedTextWriter("abc");
    writer.append("generated:");
    writer.copy(range(0, 3));

    const result = writer.finish(range(0, 3));
    expect(mapGeneratedRangeToOriginal(result, range(0, 9))).toBeUndefined();
    expect(mapOriginalOffsetToGenerated(result, 3)).toBeUndefined();
  });
});

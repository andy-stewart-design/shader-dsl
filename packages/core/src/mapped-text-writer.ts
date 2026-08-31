import type { ShaderBinaryOperator } from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";

export type SourceMappingKind = "identity" | "expression";

export interface SourceMapping {
  readonly original: TextRange;
  readonly generated: TextRange;
  readonly kind: SourceMappingKind;
}

export interface VirtualBinaryOperation {
  readonly kind: "binary-operation";
  readonly operator: ShaderBinaryOperator;
  readonly original: TextRange;
  readonly generated: TextRange;
}

export type VirtualOperation = VirtualBinaryOperation;

export interface VirtualSource {
  readonly code: string;
  readonly mappings: readonly SourceMapping[];
  readonly operations: readonly VirtualOperation[];
  readonly shaderRegion: TextRange;
}

/**
 * Builds generated source without losing the relationship to copied source text.
 * Generated text is unmapped unless it is enclosed by an expression mapping.
 */
export class MappedTextWriter {
  readonly #source: string;
  readonly #chunks: string[] = [];
  readonly #mappings: SourceMapping[] = [];
  readonly #operations: VirtualOperation[] = [];
  #length = 0;

  public constructor(source: string) {
    this.#source = source;
  }

  public get length(): number {
    return this.#length;
  }

  public append(text: string): TextRange {
    const generated = { start: this.#length, length: text.length };
    this.#chunks.push(text);
    this.#length += text.length;
    return generated;
  }

  public copy(original: TextRange): TextRange {
    assertRangeWithin(original, this.#source.length, "original");

    const generated = this.append(
      this.#source.slice(original.start, rangeEnd(original)),
    );
    this.#mappings.push({
      original: cloneRange(original),
      generated,
      kind: "identity",
    });
    return generated;
  }

  public addExpressionMapping(original: TextRange, generated: TextRange): void {
    assertRangeWithin(original, this.#source.length, "original");
    assertRangeWithin(generated, this.#length, "generated");
    this.#mappings.push({
      original: cloneRange(original),
      generated: cloneRange(generated),
      kind: "expression",
    });
  }

  public addBinaryOperation(
    operator: ShaderBinaryOperator,
    original: TextRange,
    generated: TextRange,
  ): void {
    assertRangeWithin(original, this.#source.length, "original operation");
    assertRangeWithin(generated, this.#length, "generated operation");
    this.#operations.push({
      kind: "binary-operation",
      operator,
      original: cloneRange(original),
      generated: cloneRange(generated),
    });
  }

  public writeExpression(
    original: TextRange,
    write: (writer: MappedTextWriter) => void,
  ): TextRange {
    assertRangeWithin(original, this.#source.length, "original");

    const start = this.#length;
    write(this);
    const generated = { start, length: this.#length - start };
    this.addExpressionMapping(original, generated);
    return generated;
  }

  public finish(shaderRegion: TextRange): VirtualSource {
    assertRangeWithin(shaderRegion, this.#source.length, "shader region");

    return {
      code: this.#chunks.join(""),
      mappings: this.#mappings.map(cloneMapping),
      operations: this.#operations.map(cloneOperation),
      shaderRegion: cloneRange(shaderRegion),
    };
  }
}

/**
 * Maps an original character offset to generated source. Identity mappings retain
 * the exact relative offset. Expression mappings fall back to the beginning of
 * the generated expression when no more specific identity mapping exists.
 */
export function mapOriginalOffsetToGenerated(
  virtualSource: VirtualSource,
  originalOffset: number,
): number | undefined {
  if (!Number.isInteger(originalOffset) || originalOffset < 0) return undefined;

  const mapping = selectMapping(
    virtualSource.mappings,
    (candidate) => containsOffset(candidate.original, originalOffset),
    (candidate) => candidate.original.length,
  );
  if (!mapping) return undefined;

  if (mapping.kind === "identity") {
    return mapping.generated.start + (originalOffset - mapping.original.start);
  }

  return mapping.generated.start;
}

/**
 * Maps a generated diagnostic or hover range back to original source. A range
 * inside copied text retains its exact relative position; generated expression
 * text maps to the complete original expression.
 */
export function mapGeneratedRangeToOriginal(
  virtualSource: VirtualSource,
  generatedRange: TextRange,
): TextRange | undefined {
  if (!isValidRange(generatedRange)) return undefined;

  const mapping = selectMapping(
    virtualSource.mappings,
    (candidate) => containsRange(candidate.generated, generatedRange),
    (candidate) => candidate.generated.length,
  );
  if (!mapping) return undefined;

  if (mapping.kind === "identity") {
    return {
      start:
        mapping.original.start +
        (generatedRange.start - mapping.generated.start),
      length: generatedRange.length,
    };
  }

  return cloneRange(mapping.original);
}

function selectMapping(
  mappings: readonly SourceMapping[],
  matches: (mapping: SourceMapping) => boolean,
  specificity: (mapping: SourceMapping) => number,
): SourceMapping | undefined {
  let selected: SourceMapping | undefined;

  for (const candidate of mappings) {
    if (!matches(candidate)) continue;
    if (!selected) {
      selected = candidate;
      continue;
    }

    const candidateSpecificity = specificity(candidate);
    const selectedSpecificity = specificity(selected);
    if (
      candidateSpecificity < selectedSpecificity ||
      (candidateSpecificity === selectedSpecificity &&
        candidate.kind === "identity" &&
        selected.kind !== "identity")
    ) {
      selected = candidate;
    }
  }

  return selected;
}

function containsOffset(range: TextRange, offset: number): boolean {
  if (range.length === 0) return offset === range.start;
  return offset >= range.start && offset < rangeEnd(range);
}

function containsRange(container: TextRange, contained: TextRange): boolean {
  return (
    contained.start >= container.start &&
    rangeEnd(contained) <= rangeEnd(container)
  );
}

function assertRangeWithin(
  range: TextRange,
  containingLength: number,
  label: string,
): void {
  if (!isValidRange(range) || rangeEnd(range) > containingLength) {
    throw new RangeError(
      `Invalid ${label} range ${JSON.stringify(range)} for length ${containingLength}.`,
    );
  }
}

function isValidRange(range: TextRange): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.length) &&
    range.start >= 0 &&
    range.length >= 0
  );
}

function rangeEnd(range: TextRange): number {
  return range.start + range.length;
}

function cloneRange(range: TextRange): TextRange {
  return { start: range.start, length: range.length };
}

function cloneMapping(mapping: SourceMapping): SourceMapping {
  return {
    original: cloneRange(mapping.original),
    generated: cloneRange(mapping.generated),
    kind: mapping.kind,
  };
}

function cloneOperation(operation: VirtualOperation): VirtualOperation {
  return {
    kind: operation.kind,
    operator: operation.operator,
    original: cloneRange(operation.original),
    generated: cloneRange(operation.generated),
  };
}

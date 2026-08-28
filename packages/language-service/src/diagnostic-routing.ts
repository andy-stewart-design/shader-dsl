import {
  mapGeneratedRangeToOriginal,
  ShaderDiagnosticCode,
  type ShaderDiagnostic,
  type ShaderDiagnosticCodeValue,
  type TextRange,
  type VirtualSource,
} from "@shdr/core";

import type {
  ShaderOperationDiagnostic,
  TypeScriptCheckerDiagnostic,
  TypeScriptDiagnosticCategory,
} from "./typescript-7-checker.js";

export type RoutedDiagnosticSource = "typescript" | "shdr";

export interface RoutedDiagnostic {
  readonly fileName?: string;
  readonly range: TextRange;
  readonly code: number | ShaderDiagnosticCodeValue;
  readonly category: TypeScriptDiagnosticCategory;
  readonly message: string;
  readonly source: RoutedDiagnosticSource;
}

export interface RouteShaderDiagnosticsInput {
  /** Original-source callback range. Defaults to virtualSource.shaderRegion. */
  readonly shaderRegion?: TextRange;
  readonly virtualSource?: VirtualSource;
  readonly originalSyntacticDiagnostics?: readonly TypeScriptCheckerDiagnostic[];
  readonly originalSemanticDiagnostics?: readonly TypeScriptCheckerDiagnostic[];
  readonly virtualSemanticDiagnostics?: readonly TypeScriptCheckerDiagnostic[];
  readonly shaderOperationDiagnostics?: readonly ShaderOperationDiagnostic[];
  readonly coreDiagnostics?: readonly ShaderDiagnostic[];
}

/**
 * Combines original TypeScript, virtual TypeScript, and core diagnostics without
 * depending on a TypeScript 7 session or editor protocol.
 */
export function routeShaderDiagnostics(
  input: RouteShaderDiagnosticsInput,
): readonly RoutedDiagnostic[] {
  const shaderRegion = input.shaderRegion ?? input.virtualSource?.shaderRegion;
  const originalSyntactic = input.originalSyntacticDiagnostics ?? [];
  const originalSemantic = input.originalSemanticDiagnostics ?? [];
  const virtualSemantic = input.virtualSemanticDiagnostics ?? [];
  const shaderOperations = input.shaderOperationDiagnostics ?? [];
  const core = input.coreDiagnostics ?? [];
  const routed: RoutedDiagnostic[] = [];

  for (const diagnostic of originalSyntactic) {
    addDiagnostic(routed, fromTypeScriptDiagnostic(diagnostic, "typescript"));
  }

  for (const diagnostic of originalSemantic) {
    if (!shaderRegion || !rangesOverlap(diagnostic.range, shaderRegion)) {
      addDiagnostic(routed, fromTypeScriptDiagnostic(diagnostic, "typescript"));
    }
  }

  for (const diagnostic of core) {
    if (
      diagnostic.code === ShaderDiagnosticCode.TypeScriptSyntax &&
      originalSyntactic.some((original) =>
        rangesOverlap(original.range, diagnostic.range),
      )
    ) {
      continue;
    }

    addDiagnostic(routed, {
      range: diagnostic.range,
      code: diagnostic.code,
      category: "error",
      message: diagnostic.message,
      source: "shdr",
    });
  }

  for (const diagnostic of shaderOperations) {
    if (!shaderRegion || rangesOverlap(diagnostic.range, shaderRegion)) {
      addDiagnostic(routed, fromTypeScriptDiagnostic(diagnostic, "shdr"));
    }
  }

  if (input.virtualSource && shaderRegion) {
    for (const diagnostic of virtualSemantic) {
      if (diagnostic.message.includes("__shdr_internal_")) continue;

      const originalRange = mapGeneratedRangeToOriginal(
        input.virtualSource,
        diagnostic.range,
      );
      if (!originalRange || !rangesOverlap(originalRange, shaderRegion)) {
        continue;
      }

      if (
        shaderOperations.some(
          (operation) =>
            operation.code === diagnostic.code &&
            rangesOverlap(operation.range, originalRange),
        )
      ) {
        continue;
      }

      addDiagnostic(routed, {
        ...fromTypeScriptDiagnostic(diagnostic, "typescript"),
        range: originalRange,
      });
    }
  }

  return routed.sort(compareDiagnostics);
}

function fromTypeScriptDiagnostic(
  diagnostic: TypeScriptCheckerDiagnostic,
  source: RoutedDiagnosticSource,
): RoutedDiagnostic {
  return { ...diagnostic, source };
}

function addDiagnostic(
  diagnostics: RoutedDiagnostic[],
  candidate: RoutedDiagnostic,
): void {
  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.source === candidate.source &&
        diagnostic.code === candidate.code &&
        diagnostic.message === candidate.message &&
        rangesEqual(diagnostic.range, candidate.range),
    )
  ) {
    return;
  }

  diagnostics.push(candidate);
}

function compareDiagnostics(
  left: RoutedDiagnostic,
  right: RoutedDiagnostic,
): number {
  return (
    left.range.start - right.range.start ||
    left.range.length - right.range.length ||
    String(left.code).localeCompare(String(right.code)) ||
    left.message.localeCompare(right.message)
  );
}

function rangesEqual(left: TextRange, right: TextRange): boolean {
  return left.start === right.start && left.length === right.length;
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  if (left.length === 0) return containsPosition(right, left.start);
  if (right.length === 0) return containsPosition(left, right.start);
  return left.start < rangeEnd(right) && right.start < rangeEnd(left);
}

function containsPosition(range: TextRange, position: number): boolean {
  if (range.length === 0) return position === range.start;
  return position >= range.start && position < rangeEnd(range);
}

function rangeEnd(range: TextRange): number {
  return range.start + range.length;
}

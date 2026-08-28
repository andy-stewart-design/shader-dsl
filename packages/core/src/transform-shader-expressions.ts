import { MappedTextWriter, type VirtualSource } from "./mapped-text-writer.js";
import type { ShaderFileInfo } from "./parse-shader-file.js";
import type { ShaderExpressionSyntax } from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";

export const DIV_HELPER_NAME = "__shdr_internal_div";
export const F32_HELPER_NAME = "__shdr_internal_f32";

export function transformShaderExpressions(
  source: string,
  shaderFile: ShaderFileInfo,
): VirtualSource {
  const roots = [
    ...shaderFile.callback.syntax.declarations.map(
      (declaration) => declaration.initializer,
    ),
    shaderFile.callback.syntax.returnExpression,
  ].sort((left, right) => left.range.start - right.range.start);
  const helperNames = collectHelperNames(roots);
  const writer = new MappedTextWriter(source);

  if (helperNames.length > 0) {
    writer.append(
      `import { ${helperNames.join(", ")} } from "shdr/internal";\n`,
    );
  }

  let originalCursor = 0;
  for (const expression of roots) {
    copyIfNonEmpty(writer, {
      start: originalCursor,
      length: expression.range.start - originalCursor,
    });
    writeExpression(writer, expression);
    originalCursor = rangeEnd(expression.range);
  }

  copyIfNonEmpty(writer, {
    start: originalCursor,
    length: source.length - originalCursor,
  });

  return writer.finish(shaderFile.shaderRegion);
}

function writeExpression(
  writer: MappedTextWriter,
  expression: ShaderExpressionSyntax,
): void {
  switch (expression.kind) {
    case "numeric-literal":
      writer.writeExpression(expression.range, (generated) => {
        generated.append(`${F32_HELPER_NAME}(`);
        generated.copy(expression.range);
        generated.append(")");
      });
      return;

    case "division-expression":
      writer.writeExpression(expression.range, (generated) => {
        generated.append(`${DIV_HELPER_NAME}(`);
        writeExpression(generated, expression.left);
        generated.append(", ");
        writeExpression(generated, expression.right);
        generated.append(")");
      });
      return;

    case "identifier":
      writer.copy(expression.range);
      return;

    case "parenthesized-expression":
      writePreservingChildren(writer, expression.range, [
        expression.expression,
      ]);
      return;

    case "constructor-call":
      writePreservingChildren(writer, expression.range, expression.arguments);
      return;

    case "property-access":
      writePreservingChildren(writer, expression.range, [expression.object]);
      return;
  }
}

function writePreservingChildren(
  writer: MappedTextWriter,
  parent: TextRange,
  children: readonly ShaderExpressionSyntax[],
): void {
  let originalCursor = parent.start;

  for (const child of children) {
    copyIfNonEmpty(writer, {
      start: originalCursor,
      length: child.range.start - originalCursor,
    });
    writeExpression(writer, child);
    originalCursor = rangeEnd(child.range);
  }

  copyIfNonEmpty(writer, {
    start: originalCursor,
    length: rangeEnd(parent) - originalCursor,
  });
}

function collectHelperNames(
  expressions: readonly ShaderExpressionSyntax[],
): readonly string[] {
  const helperNames = new Set<string>();

  for (const expression of expressions) {
    visitExpression(expression, helperNames);
  }

  return [...helperNames].sort();
}

function visitExpression(
  expression: ShaderExpressionSyntax,
  helperNames: Set<string>,
): void {
  switch (expression.kind) {
    case "numeric-literal":
      helperNames.add(F32_HELPER_NAME);
      return;

    case "division-expression":
      helperNames.add(DIV_HELPER_NAME);
      visitExpression(expression.left, helperNames);
      visitExpression(expression.right, helperNames);
      return;

    case "identifier":
      return;

    case "parenthesized-expression":
      visitExpression(expression.expression, helperNames);
      return;

    case "constructor-call":
      for (const argument of expression.arguments) {
        visitExpression(argument, helperNames);
      }
      return;

    case "property-access":
      visitExpression(expression.object, helperNames);
      return;
  }
}

function copyIfNonEmpty(writer: MappedTextWriter, range: TextRange): void {
  if (range.length > 0) writer.copy(range);
}

function rangeEnd(range: TextRange): number {
  return range.start + range.length;
}

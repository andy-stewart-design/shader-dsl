import { MappedTextWriter, type VirtualSource } from "./mapped-text-writer.js";
import type { ShaderFileInfo } from "./parse-shader-file.js";
import type {
  ShaderCallbackSyntax,
  ShaderExpressionSyntax,
  ShaderNumericLiteralSyntax,
} from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";

export const F32_HELPER_NAME = "__shdr_internal_f32";
export const F32_HELPER_IMPORT = `import { ${F32_HELPER_NAME} } from "shdr/internal";\n`;

export function transformNumericLiterals(
  source: string,
  shaderFile: ShaderFileInfo,
): VirtualSource {
  const numericLiterals = collectNumericLiterals(
    shaderFile.callback.syntax,
  ).sort((left, right) => left.range.start - right.range.start);
  const writer = new MappedTextWriter(source);
  writer.append(F32_HELPER_IMPORT);

  let originalCursor = 0;
  for (const literal of numericLiterals) {
    copyIfNonEmpty(writer, {
      start: originalCursor,
      length: literal.range.start - originalCursor,
    });

    writer.writeExpression(literal.range, (expression) => {
      expression.append(`${F32_HELPER_NAME}(`);
      expression.copy(literal.range);
      expression.append(")");
    });
    originalCursor = literal.range.start + literal.range.length;
  }

  copyIfNonEmpty(writer, {
    start: originalCursor,
    length: source.length - originalCursor,
  });

  return writer.finish(shaderFile.shaderRegion);
}

function collectNumericLiterals(
  callback: ShaderCallbackSyntax,
): ShaderNumericLiteralSyntax[] {
  const literals: ShaderNumericLiteralSyntax[] = [];

  for (const declaration of callback.declarations) {
    visitExpression(declaration.initializer, literals);
  }
  visitExpression(callback.returnExpression, literals);

  return literals;
}

function visitExpression(
  expression: ShaderExpressionSyntax,
  literals: ShaderNumericLiteralSyntax[],
): void {
  switch (expression.kind) {
    case "numeric-literal":
      literals.push(expression);
      return;

    case "identifier":
      return;

    case "parenthesized-expression":
      visitExpression(expression.expression, literals);
      return;

    case "division-expression":
      visitExpression(expression.left, literals);
      visitExpression(expression.right, literals);
      return;

    case "constructor-call":
      for (const argument of expression.arguments) {
        visitExpression(argument, literals);
      }
      return;

    case "property-access":
      visitExpression(expression.object, literals);
      return;
  }
}

function copyIfNonEmpty(writer: MappedTextWriter, range: TextRange): void {
  if (range.length > 0) writer.copy(range);
}

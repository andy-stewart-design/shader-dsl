import { MappedTextWriter, type VirtualSource } from "./mapped-text-writer.js";
import type { ShaderFileInfo } from "./parse-shader-file.js";
import type { ShaderBinaryOperator } from "./shader-operator.js";
import type { ShaderExpressionSyntax } from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";

export const DIV_HELPER_NAME = "__shdr_internal_div";
export const NEG_HELPER_NAME = "__shdr_internal_neg";
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

    case "binary-expression": {
      const generatedRange = writer.writeExpression(
        expression.range,
        (generated) => {
          generated.append(`${helperNameForOperator(expression.operator)}(`);
          writeExpression(generated, expression.left);
          generated.append(", ");
          writeExpression(generated, expression.right);
          generated.append(")");
        },
      );
      writer.addBinaryOperation(
        expression.operator,
        expression.range,
        generatedRange,
      );
      return;
    }

    case "unary-expression": {
      const generatedRange = writer.writeExpression(
        expression.range,
        (generated) => {
          generated.append(`${NEG_HELPER_NAME}(`);
          writeExpression(generated, expression.argument);
          generated.append(")");
        },
      );
      writer.addUnaryOperation(
        expression.operator,
        expression.range,
        generatedRange,
      );
      return;
    }

    case "identifier":
      writer.copy(expression.range);
      return;

    case "parenthesized-expression":
      writePreservingChildren(writer, expression.range, [
        expression.expression,
      ]);
      return;

    case "call-expression":
      writePreservingChildren(writer, expression.range, expression.arguments);
      return;

    case "property-access":
      writePreservingChildren(writer, expression.range, [expression.object]);
      return;
    default:
      return assertNever(expression);
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

    case "binary-expression":
      helperNames.add(helperNameForOperator(expression.operator));
      visitExpression(expression.left, helperNames);
      visitExpression(expression.right, helperNames);
      return;

    case "unary-expression":
      helperNames.add(NEG_HELPER_NAME);
      visitExpression(expression.argument, helperNames);
      return;

    case "identifier":
      return;

    case "parenthesized-expression":
      visitExpression(expression.expression, helperNames);
      return;

    case "call-expression":
      for (const argument of expression.arguments) {
        visitExpression(argument, helperNames);
      }
      return;

    case "property-access":
      visitExpression(expression.object, helperNames);
      return;
    default:
      return assertNever(expression);
  }
}

function helperNameForOperator(operator: ShaderBinaryOperator): string {
  switch (operator) {
    case "+":
      return "__shdr_internal_add";
    case "-":
      return "__shdr_internal_sub";
    case "*":
      return "__shdr_internal_mul";
    case "/":
      return DIV_HELPER_NAME;
    default:
      return assertNever(operator);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled shader syntax: ${JSON.stringify(value)}`);
}

function copyIfNonEmpty(writer: MappedTextWriter, range: TextRange): void {
  if (range.length > 0) writer.copy(range);
}

function rangeEnd(range: TextRange): number {
  return range.start + range.length;
}

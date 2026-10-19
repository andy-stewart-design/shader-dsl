import { MappedTextWriter, type VirtualSource } from "./mapped-text-writer.js";
import type { ShaderFileInfo } from "./parse-shader-file.js";
import type {
  ModuleConstantDefinition,
  ModuleConstantInitializer,
} from "./parse-module-constants.js";
import type { ShaderBinaryOperator } from "./shader-operator.js";
import type { ShaderExpressionSyntax } from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";
import type { ShaderFunctionSyntax } from "./shader-syntax.js";

export const DIV_HELPER_NAME = "__shdr_internal_div";
export const NEG_HELPER_NAME = "__shdr_internal_neg";
export const F32_HELPER_NAME = "__shdr_internal_f32";

/** Transforms helper bodies when a source has no fragment callback. */
export function transformShaderExpressionsForHelpers(
  source: string,
  helpers: readonly ShaderFunctionSyntax[],
  moduleConstants: ReadonlyMap<string, ModuleConstantDefinition> = new Map(),
): VirtualSource {
  const roots = helpers
    .flatMap((helper) => [
      ...helper.body.declarations.map((declaration) => declaration.initializer),
      helper.body.returnExpression,
    ])
    .sort((left, right) => left.range.start - right.range.start);
  const constants = [...moduleConstants.values()];
  const helperNames = collectHelperNames(roots);
  const helperNameSet = new Set(helperNames);
  for (const constant of constants)
    visitModuleInitializer(constant.initializer, helperNameSet);
  const allHelperNames = [...helperNameSet].sort();
  const writer = new MappedTextWriter(source);

  if (allHelperNames.length > 0) {
    writer.append(
      `import { ${allHelperNames.join(", ")} } from "shdr/internal";\n`,
    );
  }

  const writes = [
    ...constants.map((constant) => ({
      range: constant.initializer.range,
      write: (target: MappedTextWriter) =>
        writeModuleInitializer(target, constant.initializer),
    })),
    ...roots.map((expression) => ({
      range: expression.range,
      write: (target: MappedTextWriter) => writeExpression(target, expression),
    })),
  ].sort((left, right) => left.range.start - right.range.start);
  writeAll(writer, source, writes);

  return writer.finish(
    { start: 0, length: 0 },
    [
      ...constants.map((constant) => constant.declarationRange),
      ...helpers.map((helper) => helper.range),
    ].sort((left, right) => left.start - right.start),
  );
}

export function transformShaderExpressions(
  source: string,
  shaderFile: ShaderFileInfo,
): VirtualSource {
  const helpers = shaderFile.functions ?? [];
  const constants = [...(shaderFile.moduleConstants?.values() ?? [])];
  const roots = [
    shaderFile.callback.syntax,
    ...helpers.map((helper) => helper.body),
  ]
    .flatMap((body) => [
      ...body.declarations.map((declaration) => declaration.initializer),
      body.returnExpression,
    ])
    .sort((left, right) => left.range.start - right.range.start);
  const helperNames = collectHelperNames(roots);
  const helperNameSet = new Set(helperNames);
  for (const constant of constants)
    visitModuleInitializer(constant.initializer, helperNameSet);
  const allHelperNames = [...helperNameSet].sort();
  const writer = new MappedTextWriter(source);

  if (allHelperNames.length > 0) {
    writer.append(
      `import { ${allHelperNames.join(", ")} } from "shdr/internal";\n`,
    );
  }

  const writes = [
    ...constants.map((constant) => ({
      range: constant.initializer.range,
      write: (target: MappedTextWriter) =>
        writeModuleInitializer(target, constant.initializer),
    })),
    ...roots.map((expression) => ({
      range: expression.range,
      write: (target: MappedTextWriter) => writeExpression(target, expression),
    })),
  ].sort((left, right) => left.range.start - right.range.start);
  writeAll(writer, source, writes);

  const regions =
    constants.length || helpers.length
      ? [
          ...constants.map((constant) => constant.declarationRange),
          ...helpers.map((helper) => helper.range),
          shaderFile.shaderRegion,
        ].sort((left, right) => left.start - right.start)
      : undefined;
  return writer.finish(shaderFile.shaderRegion, regions);
}

interface VirtualWrite {
  readonly range: TextRange;
  readonly write: (writer: MappedTextWriter) => void;
}

function writeAll(
  writer: MappedTextWriter,
  source: string,
  writes: readonly VirtualWrite[],
): void {
  let originalCursor = 0;
  for (const item of writes) {
    copyIfNonEmpty(writer, {
      start: originalCursor,
      length: item.range.start - originalCursor,
    });
    item.write(writer);
    originalCursor = rangeEnd(item.range);
  }
  copyIfNonEmpty(writer, {
    start: originalCursor,
    length: source.length - originalCursor,
  });
}

function visitModuleInitializer(
  initializer: ModuleConstantInitializer,
  helperNames: Set<string>,
): void {
  switch (initializer.kind) {
    case "literal":
      helperNames.add(F32_HELPER_NAME);
      return;
    case "reference":
      return;
    case "constructor":
      for (const argument of initializer.arguments)
        visitModuleInitializer(argument, helperNames);
      return;
  }
}

function writeModuleInitializer(
  writer: MappedTextWriter,
  initializer: ModuleConstantInitializer,
): void {
  switch (initializer.kind) {
    case "literal":
      writer.writeExpression(initializer.range, (generated) => {
        generated.append(`${F32_HELPER_NAME}(`);
        generated.copy(initializer.range);
        generated.append(")");
      });
      return;
    case "reference":
      writer.copy(initializer.range);
      return;
    case "constructor":
      writer.writeExpression(initializer.range, (generated) => {
        writeModuleChildren(
          generated,
          initializer.range,
          initializer.arguments,
        );
      });
      return;
  }
}

function writeModuleChildren(
  writer: MappedTextWriter,
  parent: TextRange,
  children: readonly ModuleConstantInitializer[],
): void {
  let originalCursor = parent.start;
  for (const child of children) {
    copyIfNonEmpty(writer, {
      start: originalCursor,
      length: child.range.start - originalCursor,
    });
    writeModuleInitializer(writer, child);
    originalCursor = rangeEnd(child.range);
  }
  copyIfNonEmpty(writer, {
    start: originalCursor,
    length: rangeEnd(parent) - originalCursor,
  });
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

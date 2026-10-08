import {
  VISITOR_KEYS,
  type ArrowFunctionExpression,
  type File,
  type Node,
  type TSType,
} from "@babel/types";
import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import { normalizeShaderSyntax } from "./normalize-shader-syntax.js";
import type { ShaderFunctionSyntax } from "./shader-syntax.js";
import type { ShaderValueType } from "./shader-type.js";
import { validateShaderSyntax } from "./validate-shader-syntax.js";

export const SHADER_TYPE_IMPORTS = new Set([
  "Expr",
  "F32",
  "Vec2",
  "Vec3",
  "Vec4",
]);

/** Recognizes source markers and concrete type syntax without evaluating them. */
export function parseShaderFunctions(
  file: File,
  markerImported: boolean,
  typeImports: ReadonlySet<string>,
  importedCallables: ReadonlySet<string>,
): {
  readonly functions: readonly ShaderFunctionSyntax[];
  readonly diagnostics: readonly ShaderDiagnostic[];
} {
  // A spelling alone is not a shader boundary: preserve unrelated host code.
  if (!markerImported) return { functions: [], diagnostics: [] };
  const functions: ShaderFunctionSyntax[] = [];
  const callbacks: {
    syntax: Omit<ShaderFunctionSyntax, "body">;
    callback: ArrowFunctionExpression;
  }[] = [];
  const allowedMarkers = new Set<Node>();
  const diagnostics: ShaderDiagnostic[] = [];
  const invalid = (message: string, node: Node) => {
    diagnostics.push({
      code: ShaderDiagnosticCode.InvalidShaderFunction,
      message,
      range: rangeOf(node),
      severity: "error",
    });
  };

  for (const statement of file.program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const item of declaration.declarations) {
      const call = item.init;
      if (
        !call ||
        call.type !== "CallExpression" ||
        call.callee.type !== "Identifier" ||
        call.callee.name !== "defineShaderFunction"
      )
        continue;
      allowedMarkers.add(call);
      if (
        declaration.kind !== "const" ||
        declaration.declarations.length !== 1 ||
        item.id.type !== "Identifier" ||
        item.id.typeAnnotation
      ) {
        invalid(
          "Expected a top-level const name = defineShaderFunction(...) with a direct marker import from shdr.",
          item,
        );
        continue;
      }
      const callback = call.arguments[0];
      if (
        call.typeArguments ||
        call.arguments.length !== 1 ||
        callback?.type !== "ArrowFunctionExpression" ||
        callback.async ||
        callback.typeParameters
      ) {
        invalid(
          "defineShaderFunction requires one synchronous, non-generic arrow callback.",
          call,
        );
        continue;
      }
      const parameters: ShaderFunctionSyntax["parameters"][number][] = [];
      const names = new Set<string>();
      let valid = true;
      for (const parameter of callback.params) {
        const type =
          parameter.type === "Identifier" &&
          parameter.typeAnnotation?.type === "TSTypeAnnotation" &&
          !parameter.optional
            ? parseExpressionType(
                parameter.typeAnnotation.typeAnnotation,
                typeImports,
              )
            : undefined;
        if (
          parameter.type !== "Identifier" ||
          !type ||
          names.has(parameter.name) ||
          importedCallables.has(parameter.name)
        ) {
          invalid(
            "Helper parameters require unique simple identifiers annotated with imported Expr<F32> or Expr<Vec2/3/4<F32>> types; they cannot shadow shader callables.",
            parameter,
          );
          valid = false;
          break;
        }
        names.add(parameter.name);
        parameters.push({
          name: parameter.name,
          nameRange: {
            start: parameter.start ?? 0,
            length: parameter.name.length,
          },
          type,
        });
      }
      if (!valid) continue;
      const returnType =
        callback.returnType?.type === "TSTypeAnnotation"
          ? parseExpressionType(callback.returnType.typeAnnotation, typeImports)
          : undefined;
      if (callback.returnType && !returnType) {
        invalid(
          "Helper return annotations must be imported Expr<F32> or Expr<Vec2/3/4<F32>> types.",
          callback.returnType,
        );
        continue;
      }
      const syntax: Omit<ShaderFunctionSyntax, "body"> = {
        name: item.id.name,
        nameRange: rangeOf(item.id),
        range: rangeOf(item),
        parameters,
        ...(returnType
          ? { returnType, returnTypeRange: rangeOf(callback.returnType!) }
          : {}),
      };
      callbacks.push({ syntax, callback });
    }
  }

  visit(file.program, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "defineShaderFunction" &&
      !allowedMarkers.has(node)
    ) {
      invalid(
        "Shader helpers must be direct top-level const declarations.",
        node,
      );
    }
  });
  if (diagnostics.length) return { functions: [], diagnostics };

  const callees = new Set([
    ...importedCallables,
    ...callbacks.map(({ syntax }) => syntax.name),
  ]);
  for (const { syntax, callback } of callbacks) {
    const names = new Set(syntax.parameters.map((parameter) => parameter.name));
    if (syntax.parameters.some((parameter) => callees.has(parameter.name))) {
      invalid("Helper parameters cannot shadow shader callables.", callback);
      continue;
    }
    const errors = validateShaderSyntax(callback, callees, names);
    if (errors.length) {
      diagnostics.push(...errors);
      continue;
    }
    functions.push({
      ...syntax,
      body: { ...normalizeShaderSyntax(callback), contextBindings: [] },
    });
  }
  return { functions, diagnostics };
}

function parseExpressionType(
  type: TSType,
  imports: ReadonlySet<string>,
): ShaderValueType | undefined {
  if (
    type.type !== "TSTypeReference" ||
    type.typeName.type !== "Identifier" ||
    type.typeName.name !== "Expr" ||
    !imports.has("Expr") ||
    type.typeArguments?.params.length !== 1
  )
    return undefined;
  const value = type.typeArguments.params[0]!;
  if (isF32(value, imports)) return { kind: "scalar", scalar: "f32" };
  if (
    value.type !== "TSTypeReference" ||
    value.typeName.type !== "Identifier" ||
    !imports.has(value.typeName.name) ||
    value.typeArguments?.params.length !== 1 ||
    !isF32(value.typeArguments.params[0]!, imports)
  )
    return undefined;
  const size =
    value.typeName.name === "Vec2"
      ? 2
      : value.typeName.name === "Vec3"
        ? 3
        : value.typeName.name === "Vec4"
          ? 4
          : undefined;
  return size ? { kind: "vector", scalar: "f32", size } : undefined;
}

function isF32(type: TSType, imports: ReadonlySet<string>): boolean {
  return (
    type.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === "F32" &&
    imports.has("F32") &&
    !type.typeArguments
  );
}

function rangeOf(node: Node) {
  const start = node.start ?? 0;
  return { start, length: (node.end ?? start) - start };
}

function visit(node: Node, callback: (node: Node) => void): void {
  callback(node);
  const record = node as Node & Record<string, unknown>;
  for (const key of VISITOR_KEYS[node.type] ?? []) {
    const value = record[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object" && "type" in child)
        visit(child as Node, callback);
    }
  }
}

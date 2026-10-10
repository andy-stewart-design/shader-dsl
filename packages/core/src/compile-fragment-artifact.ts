import type { DynamicCompiledFragmentArtifact } from "shdr";
import {
  ShaderDiagnosticCode,
  type ShaderDiagnostic,
  type ShaderGraphDiagnostic,
} from "./diagnostics.js";
import { generateFragmentOutput } from "./generate-fragment.js";
import { lowerFragment } from "./lower-fragment.js";
import { parseShaderFile } from "./parse-shader-file.js";
import {
  lowerShaderGraph,
  type ShaderVirtualGraphInput,
} from "./shader-module-graph.js";
import type {
  ShaderCallbackSyntax,
  ShaderExpressionSyntax,
} from "./shader-syntax.js";

export interface CompileArtifactSuccess {
  readonly ok: true;
  readonly artifact: DynamicCompiledFragmentArtifact;
  readonly diagnostics: readonly [];
}

export interface CompileArtifactFailure {
  readonly ok: false;
  readonly artifact?: undefined;
  readonly diagnostics: readonly (ShaderDiagnostic | ShaderGraphDiagnostic)[];
}

export type CompileArtifactResult =
  CompileArtifactSuccess | CompileArtifactFailure;

function lowerSingleSource(source: string) {
  const parsed = parseShaderFile(source);
  const info = parsed.info;
  if (info?.sourceImports.length) {
    const schemaImport = info.customUniformsImport?.localName;
    const unresolved = info.sourceImports.filter((entry) => {
      if (
        entry.source.endsWith(".shdr.ts") ||
        entry.specifiers.length === 0 ||
        entry.unsupportedSpecifierRanges.length
      )
        return true;
      return entry.specifiers.some(
        ({ localName }) =>
          localName === schemaImport ||
          [
            info.callback.syntax,
            ...(info.functions ?? []).map((item) => item.body),
          ].some((body) => shaderSyntaxUses(body, localName)),
      );
    });
    if (unresolved.length) {
      return {
        ok: false as const,
        diagnostics: unresolved.map(({ source: module, sourceRange }) => ({
          code: ShaderDiagnosticCode.MissingShaderModule,
          message: `Cannot resolve imported shader module ${JSON.stringify(module)} without a supplied virtual file graph.`,
          range: sourceRange,
          severity: "error" as const,
        })),
      };
    }
  }
  return lowerFragment(source);
}

function shaderSyntaxUses(body: ShaderCallbackSyntax, name: string): boolean {
  return (
    body.declarations.some(({ initializer }) =>
      shaderExpressionUses(initializer, name),
    ) || shaderExpressionUses(body.returnExpression, name)
  );
}

function shaderExpressionUses(
  expression: ShaderExpressionSyntax,
  name: string,
): boolean {
  switch (expression.kind) {
    case "identifier":
      return expression.name === name;
    case "numeric-literal":
      return false;
    case "parenthesized-expression":
      return shaderExpressionUses(expression.expression, name);
    case "unary-expression":
      return shaderExpressionUses(expression.argument, name);
    case "binary-expression":
      return (
        shaderExpressionUses(expression.left, name) ||
        shaderExpressionUses(expression.right, name)
      );
    case "call-expression":
      return (
        expression.calleeName === name ||
        expression.arguments.some((argument) =>
          shaderExpressionUses(argument, name),
        )
      );
    case "property-access":
      return shaderExpressionUses(expression.object, name);
  }
}

/** Compiles authored source once to one target-neutral IR and two backends. */
export function compileFragmentArtifact(
  source: string | ShaderVirtualGraphInput,
): CompileArtifactResult {
  const lowered =
    typeof source === "string"
      ? lowerSingleSource(source)
      : lowerShaderGraph(source);
  if (!lowered.ok) return { ok: false, diagnostics: lowered.diagnostics };

  const glsl = generateFragmentOutput(lowered.ir, "glsl-es-300");
  const wgsl = generateFragmentOutput(lowered.ir, "wgsl");
  return {
    ok: true,
    artifact: {
      glsl: glsl.code,
      wgsl: wgsl.code,
      defaults: {
        glsl: glsl.referencedUniforms,
        wgsl: wgsl.referencedUniforms,
      },
      ...(lowered.ir.customUniforms?.length
        ? {
            custom: {
              declarations: lowered.ir.customUniforms,
              referenced: {
                glsl: glsl.referencedCustomUniforms,
                wgsl: wgsl.referencedCustomUniforms,
              },
            },
          }
        : {}),
    } as DynamicCompiledFragmentArtifact,
    diagnostics: [],
  };
}

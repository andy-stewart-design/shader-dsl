import type { CompiledFragmentArtifact, ShaderDefaultUniform } from "shdr";
import type { ShaderDiagnostic } from "./diagnostics.js";
import { generateFragment } from "./generate-fragment.js";
import { lowerFragment } from "./lower-fragment.js";
import type { ShaderExpression, ShaderModule } from "./shader-ir.js";

export interface CompileArtifactSuccess {
  readonly ok: true;
  readonly artifact: CompiledFragmentArtifact;
  readonly diagnostics: readonly [];
}

export interface CompileArtifactFailure {
  readonly ok: false;
  readonly artifact?: undefined;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

export type CompileArtifactResult =
  CompileArtifactSuccess | CompileArtifactFailure;

const DEFAULT_ORDER: readonly ShaderDefaultUniform[] = [
  "resolution",
  "mouse",
  "time",
];

/** Compiles authored source once to one target-neutral IR and two backends. */
export function compileFragmentArtifact(source: string): CompileArtifactResult {
  const lowered = lowerFragment(source);
  if (!lowered.ok) return { ok: false, diagnostics: lowered.diagnostics };

  return {
    ok: true,
    artifact: {
      glsl: generateFragment(lowered.ir, "glsl-es-300"),
      wgsl: generateFragment(lowered.ir, "wgsl"),
      defaults: collectDefaultBindings(lowered.ir),
    },
    diagnostics: [],
  };
}

/** Target-independent dependencies, with the GLSL-only coord Y conversion. */
function collectDefaultBindings(
  module: ShaderModule,
): CompiledFragmentArtifact["defaults"] {
  const referenced = new Set<ShaderDefaultUniform>();
  let usesFragmentPosition = false;

  function visit(expression: ShaderExpression): void {
    switch (expression.kind) {
      case "numeric-literal":
      case "local-reference":
        return;
      case "builtin-input":
        if (expression.input !== "fragment-position")
          return assertNever(expression.input);
        usesFragmentPosition = true;
        return;
      case "default-uniform":
        referenced.add(expression.uniform);
        return;
      case "swizzle":
        visit(expression.expression);
        return;
      case "unary":
        visit(expression.argument);
        return;
      case "binary":
        visit(expression.left);
        visit(expression.right);
        return;
      case "call":
        for (const argument of expression.arguments) visit(argument);
        return;
      default:
        return assertNever(expression);
    }
  }

  for (const statement of module.statements) {
    switch (statement.kind) {
      case "const-declaration":
        visit(statement.initializer);
        break;
      case "return-statement":
        visit(statement.expression);
        break;
      default:
        assertNever(statement);
    }
  }

  const wgsl = DEFAULT_ORDER.filter((uniform) => referenced.has(uniform));
  const glsl = DEFAULT_ORDER.filter(
    (uniform) =>
      referenced.has(uniform) ||
      (uniform === "resolution" && usesFragmentPosition),
  );
  return { glsl, wgsl };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported shader IR value: ${JSON.stringify(value)}.`);
}

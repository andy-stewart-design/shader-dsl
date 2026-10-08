import type { ShaderDiagnostic } from "./diagnostics.js";
import { lowerShaderSyntax } from "./lower-shader-syntax.js";
import {
  parseShaderFile,
  type ParseShaderFileResult,
} from "./parse-shader-file.js";
import type { ShaderModule } from "./shader-ir.js";
import {
  lowerShaderFunctions,
  reachableShaderFunctions,
} from "./lower-shader-functions.js";

export interface LowerFragmentSuccess {
  readonly ok: true;
  readonly ir: ShaderModule;
  readonly diagnostics: readonly [];
}

export interface LowerFragmentFailure {
  readonly ok: false;
  readonly ir?: undefined;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

export type LowerFragmentResult = LowerFragmentSuccess | LowerFragmentFailure;

/** Parses, validates, types, and lowers one fragment shader without selecting a backend. */
export function lowerFragment(source: string): LowerFragmentResult {
  return lowerParsedFragment(parseShaderFile(source));
}

/** Lowers an already parsed source without repeating Babel parsing/validation. */
export function lowerParsedFragment(
  parsed: ParseShaderFileResult,
): LowerFragmentResult {
  if (!parsed.info) {
    return { ok: false, diagnostics: parsed.diagnostics };
  }

  const importedCallables = new Set(
    parsed.info.shaderCallableImports.map((entry) => entry.localName),
  );
  const helpers = lowerShaderFunctions(
    parsed.info.functions ?? [],
    importedCallables,
  );
  if (!helpers.ok) return helpers;
  const lowered = lowerShaderSyntax(
    parsed.info.callback.syntax,
    new Set([...importedCallables, ...helpers.functions.keys()]),
    parsed.info.customUniforms?.declarations,
    { functions: helpers.functions },
  );
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }

  const functions = reachableShaderFunctions(
    lowered.module.statements,
    helpers.functions,
  );
  return {
    ok: true,
    ir: functions.length ? { ...lowered.module, functions } : lowered.module,
    diagnostics: [],
  };
}

import type { ShaderDiagnostic } from "./diagnostics.js";
import { lowerShaderSyntax } from "./lower-shader-syntax.js";
import { parseShaderFile } from "./parse-shader-file.js";
import type { ShaderModule } from "./shader-ir.js";

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
  const parsed = parseShaderFile(source);
  if (!parsed.info) {
    return { ok: false, diagnostics: parsed.diagnostics };
  }

  const lowered = lowerShaderSyntax(parsed.info.callback.syntax);
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }

  return { ok: true, ir: lowered.module, diagnostics: [] };
}

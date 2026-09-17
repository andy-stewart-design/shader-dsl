import type { ShaderDiagnostic } from "./diagnostics.js";
import {
  generateFragment,
  type ShaderTarget,
  validateShaderTarget,
} from "./generate-fragment.js";
import { lowerFragment } from "./lower-fragment.js";
import type { ShaderModule } from "./shader-ir.js";

export interface CompileFragmentOptions {
  readonly target: ShaderTarget;
}

export interface CompileFragmentSuccess {
  readonly ok: true;
  readonly target: ShaderTarget;
  readonly code: string;
  readonly ir: ShaderModule;
  readonly diagnostics: readonly [];
}

export interface CompileFragmentFailure {
  readonly ok: false;
  readonly target: ShaderTarget;
  readonly code?: undefined;
  readonly ir?: undefined;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

export type CompileResult = CompileFragmentSuccess | CompileFragmentFailure;

/** Lowers source once and generates only the explicitly requested target. */
export function compileFragment(
  source: string,
  options: CompileFragmentOptions,
): CompileResult {
  const target = validateShaderTarget(options.target);
  const lowered = lowerFragment(source);
  if (!lowered.ok) {
    return {
      ok: false,
      target,
      diagnostics: lowered.diagnostics,
    };
  }

  return {
    ok: true,
    target,
    code: generateFragment(lowered.ir, target),
    ir: lowered.ir,
    diagnostics: [],
  };
}

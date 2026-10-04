import type { DynamicCompiledFragmentArtifact } from "shdr";
import type { ShaderDiagnostic } from "./diagnostics.js";
import { generateFragmentOutput } from "./generate-fragment.js";
import { lowerFragment } from "./lower-fragment.js";

export interface CompileArtifactSuccess {
  readonly ok: true;
  readonly artifact: DynamicCompiledFragmentArtifact;
  readonly diagnostics: readonly [];
}

export interface CompileArtifactFailure {
  readonly ok: false;
  readonly artifact?: undefined;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

export type CompileArtifactResult =
  CompileArtifactSuccess | CompileArtifactFailure;

/** Compiles authored source once to one target-neutral IR and two backends. */
export function compileFragmentArtifact(source: string): CompileArtifactResult {
  const lowered = lowerFragment(source);
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

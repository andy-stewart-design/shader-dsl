import type { ShaderDiagnostic } from "./diagnostics.js";
import type { VirtualSource } from "./mapped-text-writer.js";
import { parseShaderFile } from "./parse-shader-file.js";
import type { TextRange } from "./source-range.js";
import { transformShaderExpressions } from "./transform-shader-expressions.js";

export interface CreateVirtualSourceSuccess {
  readonly ok: true;
  readonly virtualSource: VirtualSource;
  readonly diagnostics: readonly [];
}

export interface CreateVirtualSourceFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
  /** Present when the shader callback boundary was recognized before validation failed. */
  readonly shaderRegion?: TextRange;
}

export type CreateVirtualSourceResult =
  CreateVirtualSourceSuccess | CreateVirtualSourceFailure;

/**
 * Parses, validates, and transforms one shader module entirely in memory.
 * Virtual source is returned only when the source boundary and callback syntax
 * are valid; failures contain diagnostics in original-source coordinates.
 */
export function createVirtualSource(
  source: string,
  fileName = "shader.shdr.ts",
): CreateVirtualSourceResult {
  const parsed = parseShaderFile(source, fileName);
  if (!parsed.info) {
    return parsed.shaderRegion
      ? {
          ok: false,
          diagnostics: parsed.diagnostics,
          shaderRegion: parsed.shaderRegion,
        }
      : { ok: false, diagnostics: parsed.diagnostics };
  }

  return {
    ok: true,
    virtualSource: transformShaderExpressions(source, parsed.info),
    diagnostics: [],
  };
}

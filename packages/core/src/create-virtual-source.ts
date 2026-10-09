import type { ShaderDiagnostic } from "./diagnostics.js";
import type { VirtualSource } from "./mapped-text-writer.js";
import {
  parseShaderFile,
  type ParseShaderFileResult,
} from "./parse-shader-file.js";
import type { TextRange } from "./source-range.js";
import {
  transformShaderExpressions,
  transformShaderExpressionsForHelpers,
} from "./transform-shader-expressions.js";

export interface CreateVirtualSourceSuccess {
  readonly ok: true;
  readonly virtualSource: VirtualSource;
  readonly diagnostics: readonly [];
}

export interface CreateVirtualSourceFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
  /** Present when the fragment callback boundary was recognized before validation failed. */
  readonly shaderRegion?: TextRange;
  /** Recognized helper declarations and fragment callback, even on invalid signatures/bodies. */
  readonly shaderRegions?: readonly TextRange[];
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
  return createVirtualSourceFromParsed(
    source,
    parseShaderFile(source, fileName),
  );
}

/** Transforms already parsed source, including source-coordinate mappings. */
export function createVirtualSourceFromParsed(
  source: string,
  parsed: ParseShaderFileResult,
): CreateVirtualSourceResult {
  if (!parsed.info) {
    if (parsed.helperFunctions?.length) {
      return {
        ok: true,
        virtualSource: transformShaderExpressionsForHelpers(
          source,
          parsed.helperFunctions,
        ),
        diagnostics: [],
      };
    }
    return {
      ok: false,
      diagnostics: parsed.diagnostics,
      ...(parsed.shaderRegion ? { shaderRegion: parsed.shaderRegion } : {}),
      ...(parsed.shaderRegions ? { shaderRegions: parsed.shaderRegions } : {}),
    };
  }

  return {
    ok: true,
    virtualSource: transformShaderExpressions(source, parsed.info),
    diagnostics: [],
  };
}

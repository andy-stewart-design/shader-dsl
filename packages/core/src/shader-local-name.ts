import type { ShaderLocalSymbolId } from "./shader-ir.js";

/** Authored local names are diagnostic-only; both backends emit this private namespace. */
export function shaderLocalName(symbolId: ShaderLocalSymbolId): string {
  return `shdr_local_${symbolId}`;
}

import type { ShaderLocalSymbolId, ShaderModule } from "./shader-ir.js";
import { isSafeShaderLocalName } from "./shader-reserved-name.js";

/** Stable fallback for a local that cannot retain its authored spelling. */
export function shaderLocalName(symbolId: ShaderLocalSymbolId): string {
  return `shdr_local_${symbolId}`;
}

export type ShaderLocalNames = ReadonlyMap<ShaderLocalSymbolId, string>;

/** Plan one common, collision-free name per local before emitting either target. */
export function planShaderLocalNames(module: ShaderModule): ShaderLocalNames {
  const declarations = module.statements.filter(
    (statement) => statement.kind === "const-declaration",
  );
  const used = new Set(
    declarations.map((item) => shaderLocalName(item.symbolId)),
  );
  const planned = new Map<ShaderLocalSymbolId, string>();
  for (const declaration of declarations) {
    const chosen =
      isSafeShaderLocalName(declaration.name) && !used.has(declaration.name)
        ? declaration.name
        : shaderLocalName(declaration.symbolId);
    planned.set(declaration.symbolId, chosen);
    used.add(chosen);
  }
  return planned;
}

/** Standalone expressions with no module plan retain the ID-based fallback. */
export function emittedShaderLocalName(
  symbolId: ShaderLocalSymbolId,
  names?: ShaderLocalNames,
): string {
  return names?.get(symbolId) ?? shaderLocalName(symbolId);
}

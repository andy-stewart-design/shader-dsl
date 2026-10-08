import type {
  ShaderLocalSymbolId,
  ShaderModule,
  ShaderFunctionParameter,
} from "./shader-ir.js";
import { isSafeShaderLocalName } from "./shader-reserved-name.js";

/** Stable fallback for a local that cannot retain its authored spelling. */
export function shaderLocalName(symbolId: ShaderLocalSymbolId): string {
  return `shdr_local_${symbolId}`;
}

export type ShaderLocalNames = ReadonlyMap<ShaderLocalSymbolId, string>;

/** Plan one common, collision-free name per local before emitting either target. */
export function planShaderLocalNames(
  module: Pick<ShaderModule, "statements"> & {
    readonly parameters?: readonly ShaderFunctionParameter[];
  },
): ShaderLocalNames {
  const declarations = [
    ...(module.parameters ?? []),
    ...module.statements.filter(
      (statement) => statement.kind === "const-declaration",
    ),
  ];
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

/** Generated function names occupy a reserved namespace shared by both targets. */
export function shaderFunctionName(functionId: number): string {
  return `shdr_internal_fn_${functionId}`;
}

/** Standalone expressions with no module plan retain the ID-based fallback. */
export function emittedShaderLocalName(
  symbolId: ShaderLocalSymbolId,
  names?: ShaderLocalNames,
): string {
  return names?.get(symbolId) ?? shaderLocalName(symbolId);
}

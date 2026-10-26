import {
  compileFragmentArtifact,
  SHADER_BUILTINS,
  type CompileArtifactResult,
} from "@shdr/core/browser";

const SHADER_CONSTRUCTORS = [
  "vec2",
  "vec3",
  "vec4",
  "mat2",
  "mat3",
  "mat4",
] as const;
const SHADER_ADDITIONAL_CALLABLES = ["sample"] as const;

const SHADER_IMPORTS = [
  "createFragmentShader",
  ...Object.keys(SHADER_BUILTINS),
  ...SHADER_CONSTRUCTORS,
  ...SHADER_ADDITIONAL_CALLABLES,
];

const SOURCE_PREFIX = `import { ${SHADER_IMPORTS.join(", ")} } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
`;
const SOURCE_SUFFIX = "\n});";

/**
 * Compiles an editor body through a generated wrapper. Diagnostic ranges are
 * translated back from generated source by this prefix's length.
 */
export function compileShdrBody(body: string): CompileArtifactResult {
  const result = compileFragmentArtifact(SOURCE_PREFIX + body + SOURCE_SUFFIX);
  if (result.ok) return result;

  return {
    ok: false,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      range: mapDiagnosticRange(diagnostic.range, body.length),
    })),
  };
}

function mapDiagnosticRange(
  range: { readonly start: number; readonly length: number },
  bodyLength: number,
) {
  const prefixLength = SOURCE_PREFIX.length;
  const start = clamp(range.start - prefixLength, 0, bodyLength);
  const end = clamp(range.start + range.length - prefixLength, 0, bodyLength);
  return { start, length: Math.max(0, end - start) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

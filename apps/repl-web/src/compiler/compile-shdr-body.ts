import {
  compileFragmentArtifact,
  SHADER_BUILTINS,
  type CompileArtifactFailure,
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
const SHADER_TYPE_IMPORTS = [
  "Expr",
  "F32",
  "Vec2",
  "Vec3",
  "Vec4",
  "Mat2",
  "Mat3",
  "Mat4",
] as const;

const SHADER_IMPORTS = [
  "createFragmentShader",
  "defineShaderFunction",
  ...Object.keys(SHADER_BUILTINS),
  ...SHADER_CONSTRUCTORS,
  ...SHADER_ADDITIONAL_CALLABLES,
];

const SOURCE_HEADER = `import { ${SHADER_IMPORTS.join(", ")} } from "shdr";
import type { ${SHADER_TYPE_IMPORTS.join(", ")} } from "shdr";

`;
const MAIN_BRIDGE = `

export default createFragmentShader(({ coord, uniforms }) => {
`;
const SOURCE_SUFFIX = "\n});";

export type ShaderDocument = "main" | "utils";
type CoreDiagnostic = CompileArtifactFailure["diagnostics"][number];

export type CompileShdrDiagnostic = CoreDiagnostic & {
  readonly document: ShaderDocument;
};

export type CompileShdrBodyResult =
  | Extract<CompileArtifactResult, { readonly ok: true }>
  | {
      readonly ok: false;
      readonly artifact?: undefined;
      readonly diagnostics: readonly CompileShdrDiagnostic[];
    };

/** Compiles the two editor documents through one generated shader module. */
export function compileShdrBody(
  main: string,
  utils = "",
): CompileShdrBodyResult {
  const utilsStart = SOURCE_HEADER.length;
  const mainStart = utilsStart + utils.length + MAIN_BRIDGE.length;
  const result = compileFragmentArtifact(
    SOURCE_HEADER + utils + MAIN_BRIDGE + main + SOURCE_SUFFIX,
  );
  if (result.ok) return result;

  return {
    ok: false,
    diagnostics: result.diagnostics.map((diagnostic) => {
      const document = diagnosticDocument(
        diagnostic.range.start,
        utilsStart,
        utils.length,
        mainStart,
      );
      const source = document === "utils" ? utils : main;
      const sourceStart = document === "utils" ? utilsStart : mainStart;
      return {
        ...diagnostic,
        document,
        range: mapDiagnosticRange(diagnostic.range, sourceStart, source.length),
      };
    }),
  };
}

function diagnosticDocument(
  generatedStart: number,
  utilsStart: number,
  utilsLength: number,
  mainStart: number,
): ShaderDocument {
  if (generatedStart >= mainStart) return "main";
  if (utilsLength > 0 && generatedStart >= utilsStart) return "utils";
  return "main";
}

function mapDiagnosticRange(
  range: { readonly start: number; readonly length: number },
  sourceStart: number,
  sourceLength: number,
) {
  const start = clamp(range.start - sourceStart, 0, sourceLength);
  const end = clamp(range.start + range.length - sourceStart, 0, sourceLength);
  return { start, length: Math.max(0, end - start) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

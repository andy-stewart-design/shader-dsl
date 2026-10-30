import {
  compileFragmentArtifact,
  SHADER_BUILTINS,
  type CompileArtifactFailure,
  type CompileArtifactResult,
} from "@shdr/core/browser";
import {
  generateUniformsSource,
  type ShaderUniformDefinition,
} from "./uniform-definitions.ts";
export type { ShaderUniformDefinition } from "./uniform-definitions.ts";

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
const UNIFORM_SOURCE_HEADER = `import { ${SHADER_IMPORTS.concat("defineUniforms").join(", ")} } from "shdr";
import type { ${SHADER_TYPE_IMPORTS.join(", ")} } from "shdr";

`;
const MAIN_BRIDGE = `

export default createFragmentShader(({ coord, uniforms }) => {
`;
const SOURCE_SUFFIX = "\n});";
const UNIFORM_SOURCE_SUFFIX = "\n}, { uniforms });";

export type ShaderDocument = "main" | "utils" | "uniforms";
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
  uniformDefinitions: readonly ShaderUniformDefinition[] = [],
): CompileShdrBodyResult {
  const hasUniforms = uniformDefinitions.length > 0;
  const header = hasUniforms ? UNIFORM_SOURCE_HEADER : SOURCE_HEADER;
  const generatedUniforms = hasUniforms
    ? generateUniformsSource(uniformDefinitions)
    : { ok: true as const, source: "" };
  if (!generatedUniforms.ok) {
    return {
      ok: false,
      diagnostics: generatedUniforms.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        document: "uniforms" as const,
      })),
    };
  }

  const utilsStart = header.length + generatedUniforms.source.length;
  const mainStart = utilsStart + utils.length + MAIN_BRIDGE.length;
  const suffix = hasUniforms ? UNIFORM_SOURCE_SUFFIX : SOURCE_SUFFIX;
  const result = compileFragmentArtifact(
    header + generatedUniforms.source + utils + MAIN_BRIDGE + main + suffix,
  );
  if (result.ok) return result;

  return {
    ok: false,
    diagnostics: result.diagnostics.map((diagnostic) => {
      const document = diagnosticDocument(
        diagnostic.range.start,
        header.length,
        generatedUniforms.source.length,
        utilsStart,
        utils.length,
        mainStart,
      );
      const source =
        document === "utils"
          ? utils
          : document === "uniforms"
            ? generatedUniforms.source
            : main;
      const sourceStart =
        document === "utils"
          ? utilsStart
          : document === "uniforms"
            ? header.length
            : mainStart;
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
  headerLength: number,
  uniformsLength: number,
  utilsStart: number,
  utilsLength: number,
  mainStart: number,
): ShaderDocument {
  if (generatedStart >= mainStart) return "main";
  if (utilsLength > 0 && generatedStart >= utilsStart) return "utils";
  if (uniformsLength > 0 && generatedStart >= headerLength) return "uniforms";
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

export {
  createFragmentShader,
  defineUniforms,
  vec2,
  vec3,
  vec4,
} from "./dsl.js";
export {
  abs,
  ceil,
  cos,
  cross,
  distance,
  dot,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  sin,
  smoothstep,
  step,
} from "./math.js";
export type {
  CompiledFragmentArtifact,
  DefaultUniforms,
  DynamicCompiledFragmentArtifact,
  Expr,
  F32,
  FragmentContext,
  HostUniforms,
  ShaderDefaultUniform,
  ShaderCustomUniformDeclaration,
  ShaderCustomUniformType,
  UniformBuilder,
  UniformDeclaration,
  UniformDefinition,
  UniformExpressions,
  UniformSchema,
  UniformValue,
  TypedCompiledFragmentArtifact,
  ShaderType,
  Vec2,
  Vec3,
  Vec4,
} from "./types.js";

export type ShdrPackage = "shdr";

export const shdrPackageName: ShdrPackage = "shdr";

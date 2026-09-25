export { createFragmentShader, vec2, vec3, vec4 } from "./dsl.js";
export type {
  DefaultUniforms,
  Expr,
  F32,
  FragmentContext,
  FragmentShaderSource,
  ShaderType,
  Vec2,
  Vec3,
  Vec4,
} from "./types.js";

export type ShdrPackage = "shdr";

export const shdrPackageName: ShdrPackage = "shdr";

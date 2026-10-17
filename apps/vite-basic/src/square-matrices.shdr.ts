import {
  createFragmentShader,
  defineShaderFunction,
  mat2,
  mat3,
  mat4,
  vec2,
  vec3,
  vec4,
} from "shdr";
import type { Expr, F32, Mat3 } from "shdr";

const diagonal = defineShaderFunction((value: Expr<F32>) => mat2(value));
const copy = defineShaderFunction((value: Expr<Mat3<F32>>): Expr<Mat3<F32>> =>
  mat3(value),
);

export default createFragmentShader(({ uniforms }) => {
  const m2 = diagonal(uniforms.time);
  const m3 = copy(mat3(uniforms.time));
  const m4 = mat4(uniforms.time);
  const transformed = m2 * vec2(0.25, 0.75);
  const mixed = m3 * vec3(0.25, 0.5, 0.75);
  const final = m4 * vec4(mixed, 1);
  return vec4(transformed.x, transformed.y, final.z, 1);
});

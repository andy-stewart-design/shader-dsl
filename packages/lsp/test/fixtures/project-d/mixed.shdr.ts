import { createFragmentShader, defineShaderFunction, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";

export const scale = defineShaderFunction((x: Expr<F32>) => x * 0.5);

export default createFragmentShader(({ uniforms }) =>
  vec4(scale(uniforms.time)),
);

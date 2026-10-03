// This replacement must not type-check on a statically typed inline renderer.
import { defineUniforms, vec4 } from "../../../../packages/shdr/src/index.js";

export default defineUniforms((u) => ({
  color: u.f32(0.7),
  radius: u.f32(2),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color, uniforms.radius, uniforms.color, uniforms.radius),
);

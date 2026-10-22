import { createFragmentShader, dFdx, defineUniforms, sample, vec4 } from "shdr";
import { derivativeHelper } from "./shared/fragment-derivative-helper.shdr.ts";

export default defineUniforms((u) => ({
  tint: u.vec3(0.7, 0.4, 0.2),
  photo: u.texture2D("/abstract-01.jpg"),
})).createFragmentShader(({ coord, uniforms }) => {
  const sampled = sample(uniforms.photo, coord.xy / uniforms.resolution);
  const slope = dFdx(coord.x) + derivativeHelper(coord.y);
  return vec4(
    sampled.x * uniforms.tint.x + slope,
    sampled.y * uniforms.tint.y,
    sampled.z * uniforms.tint.z,
    1,
  );
});

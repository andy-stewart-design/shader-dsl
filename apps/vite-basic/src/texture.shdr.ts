import { defineUniforms, sample } from "shdr";

export default defineUniforms((u) => ({
  photo: u.texture2D("/abstract-01.jpg"),
})).createFragmentShader(({ coord, uniforms }) =>
  sample(uniforms.photo, coord.xy / uniforms.resolution),
);

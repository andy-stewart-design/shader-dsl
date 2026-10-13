import { defineUniforms, sample } from "shdr";

export default defineUniforms((u) => ({
  photo: u.texture2D("/photo.png"),
})).createFragmentShader(({ coord, uniforms }) =>
  sample(uniforms.photo, coord.xy / uniforms.resolution),
);

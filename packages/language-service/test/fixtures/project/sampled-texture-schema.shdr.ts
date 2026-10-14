import { defineUniforms } from "shdr";

export const uniforms = defineUniforms((u) => ({
  photo: u.texture2D("/photo.png"),
}));

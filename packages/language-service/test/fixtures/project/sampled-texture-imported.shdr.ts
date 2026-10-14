import { createFragmentShader, sample } from "shdr";
import { uniforms } from "./sampled-texture-schema.shdr.ts";

export default createFragmentShader(
  ({ coord, uniforms }) =>
    sample(uniforms.photo, coord.xy / uniforms.resolution),
  { uniforms },
);

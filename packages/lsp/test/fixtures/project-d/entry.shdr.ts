import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./mixed.shdr.ts";

export default createFragmentShader(({ uniforms }) =>
  vec4(scale(uniforms.time)),
);

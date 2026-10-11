import { createFragmentShader, vec4 } from "shdr";
import { scale } from "@fixture/editor-mixed.shdr.ts";

export default createFragmentShader(({ uniforms }) =>
  vec4(scale(uniforms.time)),
);

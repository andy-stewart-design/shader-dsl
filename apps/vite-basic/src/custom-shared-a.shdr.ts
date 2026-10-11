import { createFragmentShader, vec4 } from "shdr";
import { uniforms } from "./shared/custom-schema.shdr.ts";

export default createFragmentShader(({ uniforms }) => vec4(uniforms.gain), {
  uniforms,
});

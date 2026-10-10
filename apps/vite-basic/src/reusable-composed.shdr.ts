import { createFragmentShader, vec4 } from "shdr";
import { composedColor } from "./shared/composed-helpers.shdr.ts";
import { uniforms } from "./shared/custom-schema.shdr.ts";

export default createFragmentShader(
  (context) => {
    const uv = context.coord.xy / context.uniforms.resolution;
    return vec4(composedColor(uv, context.uniforms.gain), 1);
  },
  { uniforms },
);

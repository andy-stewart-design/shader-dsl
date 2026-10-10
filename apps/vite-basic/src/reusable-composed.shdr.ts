import { createFragmentShader, vec4 } from "shdr";
import { composedColor } from "./shared/composed-helpers.shdr.ts";
import { uniforms } from "./shared/custom-schema.shdr.ts";

export default createFragmentShader(
  ({ coord, uniforms }) => {
    const uv = coord.xy / uniforms.resolution;
    return vec4(composedColor(uv, uniforms.gain), 1);
  },
  { uniforms },
);

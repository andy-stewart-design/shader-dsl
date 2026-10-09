import { createFragmentShader, vec4 } from "shdr";
import { preserveColor } from "./shared/gradient-helper.shdr.ts";

export default createFragmentShader(({ coord, uniforms }) =>
  preserveColor(vec4(coord.x, coord.y, 0, 1)),
);

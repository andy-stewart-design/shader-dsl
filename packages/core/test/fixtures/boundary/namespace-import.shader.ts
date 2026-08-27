import * as shdr from "shdr";

export default shdr.createFragmentShader(({ coord, uniforms }) => {
  return shdr.vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});

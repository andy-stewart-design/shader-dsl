import {
  createFragmentShader,
  dFdx,
  dFdy,
  fwidth,
  vec4,
} from "shdr";
import { derivativeHelper } from "./fragment-derivative-helper.shdr.ts";

export default createFragmentShader(({ coord }) => {
  const scalarX = dFdx(coord.x);
  const scalarY = dFdy(coord.y);
  const scalarWidth = fwidth(coord.x);
  const vector2X = dFdx(coord.xy);
  const vector2Y = dFdy(coord.xy);
  const vector2Width = fwidth(coord.xy);
  const vector3X = dFdx(coord.xyz);
  const vector3Y = dFdy(coord.xyz);
  const vector3Width = fwidth(coord.xyz);
  const vector4X = dFdx(coord);
  const vector4Y = dFdy(coord);
  const vector4Width = fwidth(coord);
  const imported = derivativeHelper(coord.xy);
  return vec4(
    scalarX + scalarY + scalarWidth + vector2X.x + vector2Y.x + vector2Width.x,
    vector3X.x + vector3Y.x + vector3Width.x,
    vector4X.x + vector4Y.x + vector4Width.x,
    imported,
  );
});

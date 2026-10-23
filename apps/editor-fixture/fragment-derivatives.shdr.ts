import { createFragmentShader, dFdx, dFdy, fwidth, vec4 } from "shdr";
import { fragmentDerivativeHelper } from "./shared/fragment-derivative-helper.shdr.ts";

export default createFragmentShader(({ coord }) => {
  const derivativeScalar = dFdx(coord.x);
  const derivativeVector2 = dFdy(coord.xy);
  const derivativeVector3 = fwidth(coord.xyz);
  const derivativeVector4 = dFdx(coord);
  const helperValue = fragmentDerivativeHelper(coord.xy);
  return vec4(
    derivativeScalar + derivativeVector2.x + helperValue,
    derivativeVector2.y + derivativeVector3.x,
    derivativeVector3.y + derivativeVector4.z,
    derivativeVector4.w,
  );
});

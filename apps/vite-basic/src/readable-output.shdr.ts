import { createFragmentShader, vec2, vec4 } from "shdr";

// A readable-output fixture, with one deliberately unsafe authored identifier.
export default createFragmentShader(({ coord, uniforms }) => {
  const inputMouse = vec2(
    uniforms.mouse.x,
    uniforms.resolution.y - uniforms.mouse.y,
  );
  const uv = coord.xy / uniforms.resolution;
  const shdr_local_2 = inputMouse.y / uniforms.resolution.y;
  const attribute = shdr_local_2;
  const a = uv.x * 0.3;
  const b = uv.y * 0.2;
  const signal = a + (b + attribute * 0.1);
  const product = a * (b + attribute * 0.1);
  return vec4(signal, product, uv.y * 0.5, 1);
});

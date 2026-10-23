import {
  cos,
  createFragmentShader,
  length,
  mat2,
  max,
  sin,
  sqrt,
  tanh,
  vec2,
  vec4,
} from "shdr";

// Algebraic translation of infinite-squircle.frag. The deliberately unusual
// cosine coefficients in the reference matrix are retained verbatim. Shdr's
// coord is top-left; frag restores GLSL's bottom-left coordinate convention.
export default createFragmentShader(({ coord, uniforms }) => {
  const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
  const p = (frag * 2 - uniforms.resolution) / uniforms.resolution.y;
  const time = uniforms.time;
  const angle = time / 4 - sin(time) / 4;
  const rotation = mat2(
    cos(angle),
    cos(angle + 33),
    cos(angle + 11),
    cos(angle),
  );
  const c = p * rotation;
  const squared = c * c;
  const wave = cos(sqrt(length(squared)) / 0.1 - time);
  const palettePhase = length(c) * 3 + c.y * 2 + time;
  const colorWave = sin(vec4(palettePhase) + vec4(6, 1, 2, 0));
  const hdr = (colorWave * 0.5 + 0.6) / max(vec4(wave / 0.2), vec4(-wave));
  const color = tanh(hdr);
  return vec4(color.x, color.y, color.z, 1);
});

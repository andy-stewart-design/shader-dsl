import {
  clamp,
  createFragmentShader,
  exp,
  pow,
  sqrt,
  tanh,
  vec2,
  vec3,
  vec4,
} from "shdr";

// Finite, non-degenerate color field using every PR 3 builtin. The palette is
// directional (plasma-like), not a claimed port of a reference shader.
export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const positive = vec3(uv.x, uv.y, 0.8);
  const squared = pow(positive, vec3(2));
  const bright = sqrt(clamp(squared, vec3(0.01), vec3(0.9)));
  const glow = exp(vec3(0.1, -0.2, 0));
  const warm = tanh(vec3(0.5));
  return vec4(bright * 0.3 + glow * 0.1 + warm * 0.4, 1);
});

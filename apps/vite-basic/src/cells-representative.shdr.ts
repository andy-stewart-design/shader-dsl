import {
  defineUniforms,
  fract,
  length,
  mix,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from "shdr";

export default defineUniforms((u) => ({
  dpi: u.f32(1),
  spread: u.f32(0.32),
  blur: u.f32(0.08),
})).createFragmentShader(({ coord, uniforms }) => {
  const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
  const mouse = vec2(
    uniforms.mouse.x,
    uniforms.resolution.y - uniforms.mouse.y,
  );
  const cell = fract(frag / (8 * uniforms.dpi)) - 0.5;
  const radius = length(cell);
  const inside = step(radius, uniforms.spread);
  const feather =
    1 - smoothstep(uniforms.spread - uniforms.blur, uniforms.spread, radius);
  const influence =
    1 - smoothstep(0.1, 0.4, length((frag - mouse) / uniforms.resolution.y));
  const cellColor = mix(vec3(0.06, 0.11, 0.2), vec3(0.55, 0.78, 0.98), feather);
  const highlighted = mix(cellColor, vec3(1, 0.52, 0.25), influence);
  return vec4(highlighted * (0.8 + inside * 0.2), 1);
});

import {
  cos,
  defineUniforms,
  dot,
  fract,
  mix,
  sin,
  sqrt,
  vec2,
  vec3,
  vec4,
} from "shdr";

// Algebraic translation of plasma.frag; host defaults are illustrative, not
// claims about the original reference application's unspecified uniform values.
export default defineUniforms((u) => ({
  scale: u.f32(8),
  speed: u.f32(1),
  complexity: u.f32(1.5),
  grain: u.f32(0.025),
  colorA: u.vec3(0.08, 0.1, 0.5),
  colorB: u.vec3(0.95, 0.4, 0.18),
})).createFragmentShader(({ coord, uniforms }) => {
  // The reference uses bottom-left gl_FragCoord, while Shdr coord is top-left.
  const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
  const uv = frag / uniforms.resolution;
  const t = uniforms.time * uniforms.speed;
  const c0 = uv * uniforms.scale - uniforms.scale / 2;
  const waveX = sin(c0.x + t);
  const waveY = sin((c0.y + t) / 2);
  const waveDiagonal = sin((c0.x + c0.y + t) / 2);
  const drift = vec2(sin(t / 3), cos(t / 2)) * (uniforms.scale / 2);
  const c = c0 + drift;
  const radial = sqrt(c.x * c.x + c.y * c.y + 1);
  const waveRadial = sin(radial + t);
  const plasma = (waveX + waveY + waveDiagonal + waveRadial) / 2;
  const colorMix = sin(plasma * 3.14159 * uniforms.complexity) * 0.5 + 0.5;
  const color = mix(uniforms.colorA, uniforms.colorB, colorMix);

  // filmGrain(gl_FragCoord.xy), inlined without a shader function.
  const p3 = fract(vec3(frag.x, frag.y, frag.x) * 0.1031);
  const grainDot = dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
  const q = p3 + grainDot;
  const gr = fract((q.x + q.y) * q.z) * 2 - 1;
  const finalColor = color + gr * uniforms.grain;
  return vec4(finalColor, 1);
});

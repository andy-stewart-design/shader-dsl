import {
  cos,
  createFragmentShader,
  defineShaderFunction,
  dot,
  fract,
  mix,
  sin,
  vec2,
  vec3,
  vec4,
} from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

// Keep these helpers in the entry file so the complete shader remains
// pasteable into the single-textarea REPL without a virtual file map.
const palette = defineShaderFunction((value: Expr<F32>) => {
  const a = vec3(0.1);
  const b = vec3(0.8);
  const c = vec3(0.4);
  const d = vec3(0, 0.1, 0.2);
  return a + b * cos((c * value + d) * 6.28318);
});

const filmGrain = defineShaderFunction((p: Expr<Vec2<F32>>) => {
  const p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  const grainDot = dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
  const q = p3 + grainDot;
  return fract((q.x + q.y) * q.z) * 2 - 1;
});

// Algebraic translation of horizon-burn.frag.
export default createFragmentShader(($) => {
  // gl_FragCoord has a bottom-left origin; Shdr's coord is top-left.
  const frag = vec2($.coord.x, $.u.resolution.y - $.coord.y);
  const shdrUv = frag / $.u.resolution;
  const ndc = shdrUv * 2 - 1;
  const scaledUv = ndc * 0.06;
  const shiftedUv = scaledUv - 0.03;
  const waveSeedX = shiftedUv.x * 6;
  const waveSeedY = shiftedUv.y * 6;
  const waveX = sin(waveSeedX + sin($.u.time + waveSeedY) * 0.2);
  const waveY = sin(waveSeedY + sin($.u.time + waveSeedX) * 0.2);
  const warpedUv = shiftedUv + vec2(waveX, waveY);
  const paletteInput = warpedUv.x * sin(1) + warpedUv.y;

  const color = palette(paletteInput);
  const grainedColor = color + filmGrain(frag) * 0.1;
  const gradedColor = mix(vec3(0), grainedColor, 0.85);
  const dither = filmGrain(frag + 123.456) * 0.005;
  const finalColor = gradedColor + dither;
  return vec4(finalColor, 1);
});

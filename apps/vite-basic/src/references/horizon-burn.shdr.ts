import {
  cos,
  createFragmentShader,
  dot,
  fract,
  mix,
  sin,
  vec2,
  vec3,
  vec4,
} from "shdr";

// Algebraic translation of horizon-burn.frag. GLSL's helper functions are
// inlined because Shdr callbacks do not yet support authored functions.
export default createFragmentShader(({ coord, uniforms }) => {
  // gl_FragCoord has a bottom-left origin; Shdr's coord is top-left.
  const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
  const shdrUv = frag / uniforms.resolution;
  const ndc = shdrUv * 2 - 1;
  const scaledUv = ndc * 0.06;
  const shiftedUv = scaledUv - 0.03;
  const waveSeedX = shiftedUv.x * 6;
  const waveSeedY = shiftedUv.y * 6;
  const waveX = sin(waveSeedX + sin(uniforms.time + waveSeedY) * 0.2);
  const waveY = sin(waveSeedY + sin(uniforms.time + waveSeedX) * 0.2);
  const warpedUv = shiftedUv + vec2(waveX, waveY);
  const paletteInput = warpedUv.x * sin(1) + warpedUv.y;

  // palette(paletteInput)
  const a = vec3(0.1);
  const b = vec3(0.8);
  const c = vec3(0.4);
  const d = vec3(0, 0.1, 0.2);
  const color = a + b * cos((c * paletteInput + d) * 6.28318);

  // filmGrain(gl_FragCoord.xy)
  const grainP3 = fract(vec3(frag.x, frag.y, frag.x) * 0.1031);
  const grainDot = dot(grainP3, vec3(grainP3.y, grainP3.z, grainP3.x) + 33.33);
  const grainQ = grainP3 + grainDot;
  const grain = fract((grainQ.x + grainQ.y) * grainQ.z) * 2 - 1;
  const grainedColor = color + grain * 0.1;
  const gradedColor = mix(vec3(0), grainedColor, 0.85);

  // filmGrain(gl_FragCoord.xy + DITHER_SEED)
  const ditherCoord = frag + 123.456;
  const ditherP3 = fract(
    vec3(ditherCoord.x, ditherCoord.y, ditherCoord.x) * 0.1031,
  );
  const ditherDot = dot(
    ditherP3,
    vec3(ditherP3.y, ditherP3.z, ditherP3.x) + 33.33,
  );
  const ditherQ = ditherP3 + ditherDot;
  const dither = (fract((ditherQ.x + ditherQ.y) * ditherQ.z) * 2 - 1) * 0.005;
  const finalColor = gradedColor + dither;
  return vec4(finalColor, 1);
});

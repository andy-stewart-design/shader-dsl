import {
  abs,
  clamp,
  createFragmentShader,
  defineShaderFunction,
  defineUniforms,
  dot,
  exp,
  floor,
  fract,
  length,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

const emotionCurve = defineShaderFunction((time: Expr<F32>) => {
  const phase = fract(time / 7);
  const calm = smoothstep(0, 0.06, phase) * (1 - smoothstep(0.14, 0.25, phase));
  const calmValue = sin(phase * 62.8318530718) * 0.04 + 0.08;
  const buildStart = 0.214;
  const buildEnd = 0.5;
  const build =
    smoothstep(buildStart - 0.03, buildStart + 0.04, phase) *
    (1 - smoothstep(buildEnd - 0.04, buildEnd + 0.02, phase));
  const buildProgress0 = clamp(
    (phase - buildStart) / (buildEnd - buildStart),
    0,
    1,
  );
  const buildProgress =
    buildProgress0 * buildProgress0 * (buildProgress0 * -2 + 3);
  const buildValue = buildProgress * buildProgress * 0.85 + 0.1;
  const screamStart = 0.5;
  const screamEnd = 0.714;
  const scream =
    smoothstep(screamStart - 0.03, screamStart + 0.03, phase) *
    (1 - smoothstep(screamEnd - 0.04, screamEnd + 0.01, phase));
  const screamProgress = clamp(
    (phase - screamStart) / (screamEnd - screamStart),
    0,
    1,
  );
  const screamValue = sin(screamProgress * 3.14159265359) * 0.05 + 0.95;
  const collapseStart = 0.714;
  const collapse = smoothstep(
    collapseStart - 0.04,
    collapseStart + 0.03,
    phase,
  );
  const collapseProgress = clamp(
    (phase - collapseStart) / (1 - collapseStart),
    0,
    1,
  );
  const collapseFlash = exp(collapseProgress * -20) * 0.25;
  const flutter =
    sin(collapseProgress * 40) * exp(collapseProgress * -5) * 0.08;
  const collapseValue = max(
    (collapseFlash + 0.95) * exp(collapseProgress * -4.5) + flutter,
    0,
  );
  return (
    calmValue * calm +
    buildValue * build +
    screamValue * scream +
    collapseValue * collapse
  );
});

const hash2 = defineShaderFunction((p: Expr<Vec2<F32>>) =>
  fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
);

const noise2d = defineShaderFunction((p: Expr<Vec2<F32>>) => {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0 * f0 * (f0 * -2 + 3);
  const a = hash2(i);
  const b = hash2(i + vec2(1, 0));
  const c = hash2(i + vec2(0, 1));
  const d = hash2(i + vec2(1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
});

const hash1 = defineShaderFunction((value: Expr<F32>) =>
  fract(sin(value) * 43758.5453123),
);

const noise1 = defineShaderFunction((value: Expr<F32>) => {
  const i = floor(value);
  const f0 = fract(value);
  const f = f0 * f0 * (f0 * -2 + 3);
  return mix(hash1(i), hash1(i + 1), f);
});

const waveform = defineShaderFunction(
  (x: Expr<F32>, time: Expr<F32>, emotion: Expr<F32>, waveSpeed: Expr<F32>) => {
    const baseFrequency = 3;
    const timeOscillation = time * waveSpeed;
    const harmonics = emotion * emotion;
    const wave = sin(x * (baseFrequency * 6.28318530718) + timeOscillation * 4);
    const noiseAmount = smoothstep(0.7, 1, emotion);
    const threshold = smoothstep(0.8, 1, emotion) * -0.38 + 0.5;
    const value =
      wave +
      sin(x * (baseFrequency * 12.56637061436) + timeOscillation * 3 + 0.8) *
        0.12 +
      sin(x * (baseFrequency * 12.56637061436) + timeOscillation * 6 + 0.5) *
        harmonics *
        0.5 +
      sin(
        x * (baseFrequency * 18.849555921540002) + timeOscillation * 8 + 1.2,
      ) *
        harmonics *
        harmonics *
        0.35 +
      sin(x * (baseFrequency * 31.4159265359) + timeOscillation * 12 + 2.1) *
        harmonics *
        harmonics *
        0.2 +
      sin(x * (baseFrequency * 43.98229715026) - timeOscillation * 5 + 3.7) *
        pow(harmonics, 3) *
        0.15 +
      (noise1(x * 40 + timeOscillation * 15) - 0.5) * 2 * noiseAmount * 0.6 +
      (noise1(x * 80 - timeOscillation * 20) - 0.5) *
        2 *
        noiseAmount *
        noiseAmount *
        0.3;
    return clamp(value * (emotion * 0.45 + 0.05), -threshold, threshold);
  },
);

const uniforms = defineUniforms((u) => ({
  // The GLSL host did not specify these values; these are documented,
  // deterministic defaults and remain overridable by the runtime host.
  intensity: u.f32(1),
  waveSpeed: u.f32(1),
}));

// Algebraic translation of scream-wave.frag. u_mouse, u_time and
// u_resolution are automatic Shdr inputs. GLSL coordinates are bottom-left;
// frag is reconstructed from Shdr's top-left coord for every pixel-space use.
export default createFragmentShader(
  ({ coord, uniforms }) => {
    const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
    const uv = frag / uniforms.resolution;
    const time = uniforms.time;
    const emotion = clamp(emotionCurve(time) * uniforms.intensity, 0, 1);
    const inputMouse = vec2(
      uniforms.mouse.x,
      uniforms.resolution.y - uniforms.mouse.y,
    );
    const hasMouse = step(0.0001, length(uniforms.mouse));
    const mouseShift =
      (inputMouse / uniforms.resolution - 0.5) * 0.3 * hasMouse;
    const backgroundBase = mix(
      vec3(0.02, 0.01, 0.04),
      vec3(0.06, 0.01, 0.01),
      emotion,
    );
    const centerDistance = length(uv - vec2(0.5));
    const backgroundGlow = exp(centerDistance * centerDistance * -3);
    const backgroundGlowColor = mix(
      vec3(0.05, 0.02, 0.08),
      vec3(0.12, 0.02, 0.02),
      emotion,
    );
    const background =
      backgroundBase +
      backgroundGlowColor * backgroundGlow * (emotion * 0.5 + 0.3);
    const noiseIntensity = smoothstep(0.6, 1, emotion);
    const screenNoise =
      (noise2d(frag * 0.8 + time * 100) - 0.5) * noiseIntensity * 0.15 +
      (noise2d(frag * 2.5 + time * 200) - 0.5) *
        noiseIntensity *
        noiseIntensity *
        0.08;
    const chromatic = smoothstep(0.5, 1, emotion) * 0.025 * uniforms.intensity;
    const jitter =
      smoothstep(0.85, 1, emotion) * (noise1(time * 30) - 0.5) * 0.015;
    const glitchAmount = smoothstep(0.8, 1, emotion);
    const glitchBand = step(
      0.92,
      noise1(floor(uv.y * 25) + floor(time * 8) * 7.3),
    );
    const glitchOffset =
      glitchBand * glitchAmount * (noise1(time * 50 + uv.y * 10) - 0.5) * 0.06;
    const waveX = uv.x + glitchOffset - mouseShift.x;
    const yCenter = uv.y - 0.5 + jitter - mouseShift.y;
    const waveR = waveform(
      waveX - chromatic,
      time,
      emotion,
      uniforms.waveSpeed,
    );
    const waveG = waveform(waveX, time, emotion, uniforms.waveSpeed);
    const waveB = waveform(
      waveX + chromatic,
      time,
      emotion,
      uniforms.waveSpeed,
    );
    const distanceR = abs(yCenter - waveR);
    const distanceG = abs(yCenter - waveG);
    const distanceB = abs(yCenter - waveB);
    const thickness = emotion * 0.004 + 0.003;
    const glowRadius = emotion * 0.038 + 0.022;
    const bloomRadius = emotion * 0.14 + 0.08;
    const buildPhase = smoothstep(0.1, 0.6, emotion);
    const screamPhase = smoothstep(0.7, 0.95, emotion);
    const calmColor = vec3(0.62, 0.42, 0.88);
    const buildColor = vec3(0.95, 0.2, 0.6);
    const coreColor = mix(
      mix(calmColor, buildColor, buildPhase),
      vec3(1, 0.95, 0.9),
      screamPhase,
    );
    const glowColor = mix(
      mix(calmColor * 0.6, buildColor * 0.7, buildPhase),
      vec3(1, 0.25, 0.1),
      screamPhase,
    );
    // Normalize the reversed smoothsteps in the reference to defined forms.
    const coreR = 1 - smoothstep(0, thickness, distanceR);
    const coreG = 1 - smoothstep(0, thickness, distanceG);
    const coreB = 1 - smoothstep(0, thickness, distanceB);
    const glowDenominator = glowRadius * glowRadius;
    const bloomDenominator = bloomRadius * bloomRadius;
    const glowR = exp((-distanceR * distanceR) / glowDenominator);
    const glowG = exp((-distanceG * distanceG) / glowDenominator);
    const glowB = exp((-distanceB * distanceB) / glowDenominator);
    const bloomR = exp((-distanceR * distanceR) / bloomDenominator);
    const bloomG = exp((-distanceG * distanceG) / bloomDenominator);
    const bloomB = exp((-distanceB * distanceB) / bloomDenominator);
    const coreBrightness = smoothstep(0.8, 1, emotion) * 1.5 + 2;
    const unifiedColor =
      coreColor * coreG * coreBrightness +
      glowColor * glowG * 0.9 +
      glowColor * bloomG * 0.35;
    const splitColor = vec3(
      coreColor.x * coreR * coreBrightness +
        glowColor.x * glowR * 0.9 +
        glowColor.x * bloomR * 0.35,
      coreColor.y * coreG * coreBrightness +
        glowColor.y * glowG * 0.9 +
        glowColor.y * bloomG * 0.35,
      coreColor.z * coreB * coreBrightness +
        glowColor.z * glowB * 0.9 +
        glowColor.z * bloomB * 0.35,
    );
    const waveColor = mix(
      unifiedColor,
      splitColor,
      smoothstep(0.4, 0.9, emotion),
    );
    const belowCenter = uv.y - 0.5;
    const reflectionY = -uv.y + 1 - 0.5 + jitter;
    const reflectionDistance = abs(reflectionY - waveG);
    const reflectionFade =
      step(0, belowCenter) * (1 - smoothstep(0, 0.35, belowCenter)) * 0.2;
    const reflectionGlow = exp(
      (-reflectionDistance * reflectionDistance) / (glowDenominator * 3),
    );
    const reflectionBloom = exp(
      (-reflectionDistance * reflectionDistance) / (bloomDenominator * 2.5),
    );
    const reflectionColor =
      (glowColor * reflectionGlow * 0.45 + glowColor * reflectionBloom * 0.12) *
      reflectionFade;
    const color = background + waveColor + reflectionColor;
    const scanline = smoothstep(0.8, 1, emotion) * 0.08;
    const scan = sin(frag.y * 1.5) * 0.5 + 0.5;
    const vignetteUv = uv - 0.5;
    const vignette = clamp(dot(vignetteUv, vignetteUv) * -1.8 + 1, 0, 1);
    const pulse = smoothstep(0.85, 1, emotion) * sin(time * 25) * 0.15 + 1;
    const graded =
      (color * (1 - scanline * scan) + vec3(screenNoise)) *
      (vignette * 0.5 + 0.5) *
      pulse;
    const output = pow(max(graded / (graded * 0.4 + 1), vec3(0)), vec3(0.95));
    return vec4(output, 1);
  },
  { uniforms },
);

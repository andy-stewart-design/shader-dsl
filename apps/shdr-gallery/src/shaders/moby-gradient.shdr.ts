import {
  clamp,
  cos,
  createFragmentShader,
  defineShaderFunction,
  dot,
  floor,
  fract,
  mix,
  pow,
  radians,
  sin,
  smoothstep,
  vec2,
  vec3,
  vec4,
  mat2,
} from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

const hash = defineShaderFunction((p: Expr<Vec2<F32>>) => {
  const q = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
  return fract(sin(q) * 43758.5453);
});

const noise = defineShaderFunction((p: Expr<Vec2<F32>>) => {
  const i = floor(p);
  const f = fract(p);
  const u = f * f * (-(f * 2) + 3);
  const g00 = hash(i + vec2(0));
  const g10 = hash(i + vec2(1, 0));
  const g01 = hash(i + vec2(0, 1));
  const g11 = hash(i + vec2(1));
  const d00 = dot(g00 * 2 - 1, f - vec2(0));
  const d10 = dot(g10 * 2 - 1, f - vec2(1, 0));
  const d01 = dot(g01 * 2 - 1, f - vec2(0, 1));
  const d11 = dot(g11 * 2 - 1, f - vec2(1));
  return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y) * 0.5 + 0.5;
});

const rot = defineShaderFunction((angle: Expr<F32>) => {
  const s = sin(angle);
  const c = cos(angle);
  return mat2(c, -s, s, c);
});

const filmGrain = defineShaderFunction((p: Expr<Vec2<F32>>) => {
  const p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  const grainDot = dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
  const q = p3 + grainDot;
  return fract((q.x + q.y) * q.z) * 2 - 1;
});

const vignette = defineShaderFunction(
  (p: Expr<Vec2<F32>>, intensity: Expr<F32>) => {
    const centered = p - 0.5;
    const distance = dot(centered, centered);
    const value = clamp(-distance * intensity * 2.5 + 1, 0, 1);
    return pow(value, 1.5);
  },
);

// Algebraic translation of moby-gradient.frag. Host values are automatic
// u_time/u_resolution; the source has no custom uniforms. Coordinates are
// reconstructed as bottom-left gl_FragCoord because Shdr coord is top-left.
export default createFragmentShader(($) => {
  const frag = vec2($.coord.x, $.u.resolution.y - $.coord.y);
  const uv = frag / $.u.resolution;
  const aspectRatio = $.u.resolution.x / $.u.resolution.y;
  const centeredUv = uv - 0.5;
  const rotationNoise = noise(
    vec2($.u.time * 0.05, centeredUv.x * centeredUv.y),
  );
  const rotationAngle = radians((rotationNoise - 0.5) * 720 + 180);
  const aspectUv = vec2(centeredUv.x, centeredUv.y / aspectRatio);
  const rotatedUv = rot(rotationAngle) * aspectUv;
  const correctedUv = vec2(rotatedUv.x, rotatedUv.y * aspectRatio);
  const waveTime = $.u.time * 2;
  const xWave = sin(correctedUv.y * 5 + waveTime) / 30;
  const yWave = sin(correctedUv.x * 5 * 1.5 + waveTime) / (30 * 0.5);
  const warpedUv = vec2(correctedUv.x + xWave, correctedUv.y + yWave);
  const layerRotation = rot(radians(-5));
  const layerBlend = smoothstep(-0.3, 0.2, (warpedUv * layerRotation).x);
  const layer1 = mix(
    vec3(1, 0.5098039215686274, 0.35294117647058826),
    vec3(0.5176470588235295, 0.7058823529411765, 0.984313725490196),
    layerBlend,
  );
  const layer2 = mix(
    vec3(0.9647058823529412, 0.8784313725490196, 0.08627450980392157),
    vec3(0.2980392156862745, 0.8823529411764706, 0.3764705882352941),
    layerBlend,
  );
  // Reference smoothstep(0.5, -0.3, y), normalized for defined behavior.
  const color = mix(layer1, layer2, 1 - smoothstep(-0.3, 0.5, warpedUv.y));
  const grain = filmGrain(frag);
  const grainedColor = color + grain * 0.1;
  const finalColor = grainedColor * vignette(uv, 0.125);
  return vec4(finalColor, 1);
});

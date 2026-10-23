import {
  abs,
  asin,
  atan,
  cos,
  createFragmentShader,
  defineShaderFunction,
  floor,
  fract,
  length,
  mat2,
  mix,
  mod,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from "shdr";
import type { Expr, F32, Vec2, Vec3 } from "shdr";

const circle = defineShaderFunction(
  (
    p: Expr<Vec2<F32>>,
    center: Expr<Vec2<F32>>,
    radius: Expr<F32>,
    edgeMix: Expr<F32>,
    resolutionY: Expr<F32>,
  ) => {
    const distance = length(p - center) - radius;
    const edgeDistance = mix(abs(distance), distance, edgeMix);
    return 1 - smoothstep(-2 / resolutionY, 3 / resolutionY, edgeDistance);
  },
);

const hue = defineShaderFunction((hsl: Expr<Vec3<F32>>) => {
  const shifted = vec3(0, 4, 2) + hsl.x * 6;
  const wrapped = mod(shifted, 6);
  // The reference uses smoothstep(2, 1, x).  Normalize the reversed
  // interval to its defined equivalent so GLSL and WGSL agree.
  const ss = 1 - smoothstep(vec3(1), vec3(2), abs(wrapped - 3));
  const inner = ss * hsl.y;
  const factor = 1 - inner;
  return factor * hsl.z;
});

const circles = defineShaderFunction(
  (
    xy: Expr<Vec2<F32>>,
    center: Expr<Vec2<F32>>,
    radius: Expr<F32>,
    satelliteRadius: Expr<F32>,
    phase: Expr<F32>,
    resolutionY: Expr<F32>,
  ) => {
    const angleStep = asin(satelliteRadius / (radius + satelliteRadius)) * 2.5;
    const divisions = abs(6.28318 / angleStep) + 0.01;
    const count = floor(divisions);
    const padding = (fract(divisions) * angleStep) / count;
    const rotatedAngle = angleStep / -2 - padding / 2 + phase;
    const rotation = mat2(
      cos(rotatedAngle),
      -sin(rotatedAngle),
      sin(rotatedAngle),
      cos(rotatedAngle),
    );
    const rotated = rotation * (xy - center);
    const index = floor(atan(rotated.y, rotated.x) / (angleStep + padding));
    const angle = index * (angleStep + padding) + phase;
    const satelliteCenter =
      vec2(cos(angle), sin(angle)) * (radius + satelliteRadius) + center;
    const hsl = vec3(index / count, 1, 0.75);
    return (
      vec3(circle(xy, satelliteCenter, satelliteRadius, 1, resolutionY)) *
      hue(hsl)
    );
  },
);

// Algebraic translation of circles-circling.frag. Shdr coord has a top-left
// origin, so reconstruct bottom-left gl_FragCoord before calculating xy.
export default createFragmentShader(({ coord, uniforms }) => {
  const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
  const centralRadius = 0.1;
  const satelliteRadius = 0.0375;
  const rotationSpeed = 0.15;
  const spacing = 2.5;
  const center = vec2(0);
  const xy = (frag * 2 - uniforms.resolution) / uniforms.resolution.y;
  const distanceFromCenter = length(xy - center);
  const index = floor(
    (distanceFromCenter - centralRadius) / (satelliteRadius * spacing),
  );
  const phase = -(uniforms.time * rotationSpeed) * (index * 0.1 + 1);
  const color =
    circles(
      xy,
      center,
      centralRadius + satelliteRadius * index * spacing,
      satelliteRadius,
      phase,
      uniforms.resolution.y,
    ) * step(0, index);
  return vec4(color * 0.9, 1);
});

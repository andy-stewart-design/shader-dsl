/* eslint-disable no-undef */

// UNIFORMS ——————————————————————————————————————————————————
// blue: #0091ff
// mag: #b400cc
// cells: 8

// MAIN ——————————————————————————————————————————————————————
// const uv = coord.xy / uniforms.resolution;
// const pixelUv = (floor(uv * uniforms.cells) + 0.5) / uniforms.cells;
// const t = (pixelUv.x + pixelUv.y) * 0.5;
// const gradient = mix(uniforms.blue, uniforms.mag, t);
// return vec4(gradient, 1);

// const uv = coord.xy / uniforms.resolution;
// const blend = (uv.x + uv.y) * 0.5;
// const t = (sin(uniforms.time) + 1) / 2
// const gradient = mix(uniforms.blue, uniforms.mag, t - blend);
// return vec4(gradient, 1);

const uv = coord.xy / uniforms.resolution;
const pixelUv = (floor(uv * uniforms.cells) + 0.5) / uniforms.cells;
const position = (pixelUv.x + pixelUv.y) * 0.5 + uniforms.time * 0.5;

// Repeats smoothly: 0 → 1 → 0 → 1…
const blend = 1 - abs(fract(position * 0.5) * 2 - 1);

const gradient = mix(uniforms.blue, uniforms.mag, blend);
return vec4(gradient, 1);

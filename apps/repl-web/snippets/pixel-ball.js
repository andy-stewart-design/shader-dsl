/* eslint-disable no-undef */

const resolution = uniforms.resolution;

// Match GLSL’s bottom-left coordinate origin.
const dir = 0;
const pixelY = mix(resolution.y - coord.y, coord.y, dir);
const pixel = vec2(coord.x, pixelY);

// Center, correct aspect ratio, and pixelate.
const grid = ((pixel * 2 - resolution) / resolution.y) * 32;
const p = floor(grid + 0.5) / 24;

// Radial field.
const z = 1 - dot(p, p);

// Animate, offsetting each color channel.
const phase = uniforms.time + p.x - p.y * z * 6 + vec4(0, 0.4, 1, 0);

// shdr doesn't currently have tan().
const tangent = sin(phase) / cos(phase);

const grain = z * fract(dot(p, vec2(11)));
const glow = vec4(z * 6) / exp(vec4(2) / abs(tangent));

// Quantize colors and output opaque.
const color = floor(grain + glow) / 4;
return vec4(color.xyz, 1);

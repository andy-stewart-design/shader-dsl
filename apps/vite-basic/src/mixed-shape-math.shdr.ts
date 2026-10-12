import { clamp, createFragmentShader, pow, sin, vec2, vec3, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  // Keep every dynamic clamp bound ordered and every pow base positive.
  const s = sin(uniforms.time * 0.25) * 0.1 + 0.75;
  const low2 = vec2(0.1 + uv.x * 0.1, 0.2 + uv.y * 0.1);
  const high2 = vec2(s + 0.4 + uv.x * 0.1, s + 0.5 + uv.y * 0.1);
  const low3 = vec3(low2, 0.3);
  const high3 = vec3(high2, s + 0.6);
  const low4 = vec4(low3, 0.4);
  const high4 = vec4(high3, s + 0.7);
  const a = clamp(high2, s, s);
  const b = clamp(high2, s, high2);
  const c = clamp(low2, low2, s);
  const d = pow(low2, s);
  const e = clamp(high3, s, s);
  const f = clamp(high3, s, high3);
  const g = clamp(low3, low3, s);
  const h = pow(low3, s);
  const i = clamp(high4, s, s);
  const j = clamp(high4, s, high4);
  const k = clamp(low4, low4, s);
  const l = pow(low4, s);
  return vec4(
    a.x + b.x + c.x + d.x,
    e.x + f.x + g.x + h.x,
    i.x + j.x + k.x + l.x,
    1,
  );
});

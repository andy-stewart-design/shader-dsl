import { clamp, createFragmentShader, pow, vec2, vec3, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const a = clamp(v2, s, s);
  const b = clamp(v2, s, v2);
  const c = clamp(v2, v2, s);
  const d = pow(v2, s);
  const e = clamp(v3, s, s);
  const f = clamp(v3, s, v3);
  const g = clamp(v3, v3, s);
  const h = pow(v3, s);
  const i = clamp(v4, s, s);
  const j = clamp(v4, s, v4);
  const k = clamp(v4, v4, s);
  const l = pow(v4, s);
  return vec4(
    a.x + b.x + c.x + d.x,
    e.x + f.x + g.x + h.x,
    i.x + j.x + k.x + l.x,
    1,
  );
});

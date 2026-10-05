#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_dpi;
uniform float u_spread;
uniform float u_blur;
out vec4 fragColor;

void main() {
  vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv0 = (gl_FragCoord.xy / u_resolution);
  vec2 mouse0 = mix(vec2(0.5), (u_mouse / u_resolution), step(0.0001, length(u_mouse)));
  vec2 uv1 = ((uv0 * 2.0) - 1.0);
  vec2 mouse1 = ((mouse0 * 2.0) - 1.0);
  float aspect = (u_resolution.x / u_resolution.y);
  vec2 aspectUv = vec2((uv1.x * aspect), uv1.y);
  vec2 mouse = vec2((mouse1.x * aspect), mouse1.y);
  vec2 uvScreen = aspectUv;
  vec2 cellUv = ((fract((aspectUv * u_dpi)) * 2.0) - 1.0);
  vec2 cellIndex = floor((uvScreen * u_dpi));
  vec2 cellCenter = ((cellIndex + 0.5) / u_dpi);
  float distFromMouse = length((cellCenter - mouse));
  float spreadAmount = ((((-u_spread) + 1.0) * 2.5) + 0.5);
  float darkFactor = min((distFromMouse * spreadAmount), 1.0);
  float blur = max(0.025, (distFromMouse * u_blur));
  float rad = ((-distFromMouse) + 1.0);
  float d0 = length(cellUv);
  float d = ((-smoothstep((rad - blur), (rad + blur), d0)) + 1.0);
  float rg = ((distFromMouse * -0.75) + 0.75);
  vec3 color = ((vec3(rg, rg, 1.0) * d) - darkFactor);
  fragColor = vec4(color, 1.0);
}

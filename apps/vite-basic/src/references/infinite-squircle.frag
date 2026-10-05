#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
out vec4 fragColor;

void main() {
    vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (((gl_FragCoord.xy * 2.0) - u_resolution) / u_resolution.y);
    float t = u_time;
    float angle = ((t / 4.0) - (sin(t) / 4.0));
    mat2 rotation = mat2(cos(angle), cos((angle + 33.0)), cos((angle + 11.0)), cos(angle));
    vec2 c = (p * rotation);
    vec2 squared = (c * c);
    float wave = cos(((sqrt(length(squared)) / 0.1) - t));
    float palettePhase = (((length(c) * 3.0) + (c.y * 2.0)) + t);
    vec4 colorWave = sin((vec4(palettePhase) + vec4(6.0, 1.0, 2.0, 0.0)));
    vec4 hdr = (((colorWave * 0.5) + 0.6) / max((wave / 0.2), (-wave)));
    vec4 color = tanh(hdr);
    fragColor = vec4(color.rgb, 1.0);
}

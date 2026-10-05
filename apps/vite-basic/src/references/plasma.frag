#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_scale;
uniform float u_speed;
uniform float u_complexity;
uniform float u_grain;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
out vec4 fragColor;

float filmGrain(vec2 _p0) {
    vec3 p3 = fract((vec3(_p0.x, _p0.y, _p0.x) * 0.1031));
    float d = dot(p3, (vec3(p3.y, p3.z, p3.x) + 33.33));
    vec3 q = (p3 + d);
    return ((fract(((q.x + q.y) * q.z)) * 2.0) - 1.0);
}

void main() {
    vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 uv = (gl_FragCoord.xy / u_resolution);
    float t = (u_time * u_speed);
    vec2 c0 = ((uv * u_scale) - (u_scale / 2.0));
    float waveX = sin((c0.x + t));
    float waveY = sin(((c0.y + t) / 2.0));
    float waveDiagonal = sin((((c0.x + c0.y) + t) / 2.0));
    vec2 drift = (vec2(sin((t / 3.0)), cos((t / 2.0))) * (u_scale / 2.0));
    vec2 c = (c0 + drift);
    float radial = sqrt((((c.x * c.x) + (c.y * c.y)) + 1.0));
    float waveRadial = sin((radial + t));
    float plasma = ((((waveX + waveY) + waveDiagonal) + waveRadial) / 2.0);
    float colorMix = ((sin(((plasma * 3.14159) * u_complexity)) * 0.5) + 0.5);
    vec3 color = mix(u_colorA, u_colorB, colorMix);
    float gr = filmGrain(gl_FragCoord.xy);
    vec3 finalColor = (color + (gr * u_grain));
    fragColor = vec4(finalColor, 1.0);
}

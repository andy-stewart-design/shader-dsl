#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
out vec4 fragColor;

const float GRAIN_AMOUNT = 0.1;
const float DITHER_AMOUNT = 0.005;
const float DITHER_SEED = 123.456;

vec3 palette(float _p0) {
    vec3 a = vec3(0.1);
    vec3 b = vec3(0.8);
    vec3 c = vec3(0.4);
    vec3 d = vec3(0.0, 0.1, 0.2);
    return (a + (b * cos((((c * _p0) + d) * 6.28318))));
}
float filmGrain(vec2 _p0) {
    vec3 p3 = fract((vec3(_p0.x, _p0.y, _p0.x) * 0.1031));
    float d = dot(p3, (vec3(p3.y, p3.z, p3.x) + 33.33));
    vec3 q = (p3 + d);
    return ((fract(((q.x + q.y) * q.z)) * 2.0) - 1.0);
}

void main() {
    vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 ndc = ((shdr_uv * 2.0) - 1.0);
    vec2 scaledUv = (ndc * 0.06);
    vec2 shiftedUv = (scaledUv - 0.03);
    float waveSeedX = (shiftedUv.x * 6.0);
    float waveSeedY = (shiftedUv.y * 6.0);
    float waveX = sin((waveSeedX + (sin((u_time + waveSeedY)) * 0.2)));
    float waveY = sin((waveSeedY + (sin((u_time + waveSeedX)) * 0.2)));
    vec2 warpedUv = (shiftedUv + vec2(waveX, waveY));
    float paletteInput = ((warpedUv.x * sin(1.0)) + warpedUv.y);
    vec3 color = palette(paletteInput);
    vec3 grainedColor = (color + (filmGrain(gl_FragCoord.xy) * GRAIN_AMOUNT));
    vec3 gradedColor = mix(vec3(0.0), grainedColor, 0.85);
    float dither = (filmGrain((gl_FragCoord.xy + DITHER_SEED)) * DITHER_AMOUNT);
    vec3 finalColor = (gradedColor + dither);
    fragColor = vec4(finalColor, 1.0);
}

#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
out vec4 fragColor;

const float CENTRAL_RAD = float(0.1);
const float SATELLITE_RAD = float(0.0375);
const float ROTATION_SPEED = 0.15;
const float SPACING = 2.5;
const vec2 C = vec2(0.0);

float circle(vec2 _p0, vec2 _p1, float _p2, float _p3, float _p4) {
    float dist = (length((_p0 - _p1)) - _p2);
    float edgeDist = mix(abs(dist), dist, _p3);
    return (1.0 - smoothstep((-2.0 / _p4), (3.0 / _p4), edgeDist));
}
vec3 hue(vec3 _p0) {
    vec3 shifted = (vec3(0.0, 4.0, 2.0) + (_p0.x * 6.0));
    vec3 wrapped = mod(shifted, 6.0);
    vec3 ss = smoothstep(2.0, 1.0, abs((wrapped - 3.0)));
    vec3 inner = (ss * _p0.y);
    vec3 factor = ((-inner) + 1.0);
    return (factor * _p0.z);
}
vec3 circles(vec2 xy, vec2 C, float R, float r, float ph, float resY) {
    float t = (asin((r / (R + r))) * 2.5);
    float divv = (abs((6.28318 / t)) + 0.01);
    float n = floor(divv);
    float pad = ((fract(divv) * t) / n);
    float rt = (((t / -2.0) - (pad / 2.0)) + ph);
    mat2 rm = mat2(cos(rt), (-sin(rt)), sin(rt), cos(rt));
    vec2 zw = (rm * (xy - C));
    float i = floor((atan(zw.y, zw.x) / (t + pad)));
    float angle = ((i * (t + pad)) + ph);
    vec2 cPos = ((vec2(cos(angle), sin(angle)) * (R + r)) + C);
    vec3 hsl = vec3((i / n), 1.0, 0.75);
    return (vec3(circle(xy, cPos, r, 1.0, resY)) * hue(hsl));
}

void main() {
    vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 xy = (((gl_FragCoord.xy * 2.0) - u_resolution) / u_resolution.y);
    float distFromCenter = length((xy - C));
    float i = floor(((distFromCenter - CENTRAL_RAD) / (SATELLITE_RAD * SPACING)));
    float phaseOffset = (-((u_time * ROTATION_SPEED) * ((i * 0.1) + 1.0)));
    vec3 col = (circles(xy, C, (CENTRAL_RAD + ((SATELLITE_RAD * i) * SPACING)), SATELLITE_RAD, phaseOffset, u_resolution.y) * step(0.0, i));
    fragColor = vec4((col * 0.9), 1.0);
}

#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
out vec4 fragColor;

const float FILM_GRAIN_INTENSITY = 0.1;
const float VIGNETTE_INTENSITY = 0.125;
const vec3 COLOR_GREEN = vec3(0.2980392156862745, 0.8823529411764706, 0.3764705882352941);
const vec3 COLOR_BLUE = vec3(0.5176470588235295, 0.7058823529411765, 0.984313725490196);
const vec3 COLOR_ORANGE = vec3(1.0, 0.5098039215686274, 0.35294117647058826);
const vec3 COLOR_YELLOW = vec3(0.9647058823529412, 0.8784313725490196, 0.08627450980392157);
const float ROT_NOISE_SPEED = 0.05;
const float ROT_SPREAD_DEG = 720.0;
const float ROT_OFFSET_DEG = 180.0;
const float LAYER_ROT_DEG = -5.0;
const float WAVE_FREQ = 5.0;
const float WAVE_AMP = float(30.0);
const float WAVE_SPEED = 2.0;
const float WAVE_Y_FREQ_SCALE = 1.5;
const float WAVE_Y_AMP_SCALE = 0.5;

vec2 hash(vec2 _p0) {
    vec2 q = vec2(dot(_p0, vec2(2127.1, 81.17)), dot(_p0, vec2(1269.5, 283.37)));
    return fract((sin(q) * 43758.5453));
}
float noise(vec2 _p0) {
    vec2 i = floor(_p0);
    vec2 f = fract(_p0);
    vec2 u = ((f * f) * (-((f * 2.0) - 3.0)));
    vec2 v00 = vec2(0.0, 0.0);
    vec2 v10 = vec2(1.0, 0.0);
    vec2 v01 = vec2(0.0, 1.0);
    vec2 v11 = vec2(1.0, 1.0);
    vec2 g00 = ((hash((i + v00)) * 2.0) - 1.0);
    vec2 g10 = ((hash((i + v10)) * 2.0) - 1.0);
    vec2 g01 = ((hash((i + v01)) * 2.0) - 1.0);
    vec2 g11 = ((hash((i + v11)) * 2.0) - 1.0);
    float d00 = dot(g00, (f - v00));
    float d10 = dot(g10, (f - v10));
    float d01 = dot(g01, (f - v01));
    float d11 = dot(g11, (f - v11));
    return ((mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y) * 0.5) + 0.5);
}
mat2 rot(float _p0) {
    float s = sin(_p0);
    float c = cos(_p0);
    return mat2(c, (-s), s, c);
}
float filmGrain(vec2 _p0) {
    vec3 p3 = fract((vec3(_p0.x, _p0.y, _p0.x) * 0.1031));
    float d = dot(p3, (vec3(p3.y, p3.z, p3.x) + 33.33));
    vec3 q = (p3 + d);
    return ((fract(((q.x + q.y) * q.z)) * 2.0) - 1.0);
}
float vignette(vec2 _p0, float _p1) {
    vec2 centered = (_p0 - 0.5);
    float dist = dot(centered, centered);
    float vig = clamp(((-((dist * _p1) * 2.5)) + 1.0), 0.0, 1.0);
    return pow(vig, 1.5);
}

void main() {
    vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
    float aspectRatio = (u_resolution.x / u_resolution.y);
    vec2 centeredUv = (shdr_uv - 0.5);
    float rotationNoise = noise(vec2((u_time * ROT_NOISE_SPEED), (centeredUv.x * centeredUv.y)));
    float rotationAngle = radians((((rotationNoise - 0.5) * ROT_SPREAD_DEG) + ROT_OFFSET_DEG));
    vec2 aspectUv = vec2(centeredUv.x, (centeredUv.y / aspectRatio));
    vec2 rotatedUv = (rot(rotationAngle) * aspectUv);
    vec2 correctedUv = vec2(rotatedUv.x, (rotatedUv.y * aspectRatio));
    float waveTime = (u_time * WAVE_SPEED);
    float xWave = (sin(((correctedUv.y * WAVE_FREQ) + waveTime)) / WAVE_AMP);
    float yWave = (sin((((correctedUv.x * WAVE_FREQ) * WAVE_Y_FREQ_SCALE) + waveTime)) / (WAVE_AMP * WAVE_Y_AMP_SCALE));
    vec2 warpedUv = vec2((correctedUv.x + xWave), (correctedUv.y + yWave));
    mat2 layerRot = rot(radians(LAYER_ROT_DEG));
    float layerBlend = smoothstep(-0.3, 0.2, (warpedUv * layerRot).x);
    vec3 layer1 = mix(COLOR_ORANGE, COLOR_BLUE, layerBlend);
    vec3 layer2 = mix(COLOR_YELLOW, COLOR_GREEN, layerBlend);
    vec3 color = mix(layer1, layer2, smoothstep(0.5, -0.3, warpedUv.y));
    float grain = filmGrain(gl_FragCoord.xy);
    vec3 grainedColor = (color + (grain * FILM_GRAIN_INTENSITY));
    vec3 finalColor = (grainedColor * vignette(shdr_uv, VIGNETTE_INTENSITY));
    fragColor = vec4(finalColor, 1.0);
}

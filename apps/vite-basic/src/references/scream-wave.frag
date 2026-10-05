#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_intensity;
uniform float u_waveSpeed;
out vec4 fragColor;

float emotionCurve(float _p0) {
    float phase = fract((_p0 / 7.0));
    float calm = (smoothstep(0.0, 0.06, phase) * ((-smoothstep(0.14, 0.25, phase)) + 1.0));
    float calmVal = ((sin((phase * 62.8318530718)) * 0.04) + 0.08);
    float buildStart = float(0.214);
    float buildEnd = float(0.5);
    float build = (smoothstep((buildStart - 0.03), (buildStart + 0.04), phase) * ((-smoothstep((buildEnd - 0.04), (buildEnd + 0.02), phase)) + 1.0));
    float buildProgress0 = clamp(((phase - buildStart) / (buildEnd - buildStart)), 0.0, 1.0);
    float buildProgress = ((buildProgress0 * buildProgress0) * ((buildProgress0 * -2.0) + 3.0));
    float buildVal = (((buildProgress * buildProgress) * 0.85) + 0.1);
    float screamStart = float(0.5);
    float screamEnd = float(0.714);
    float scream = (smoothstep((screamStart - 0.03), (screamStart + 0.03), phase) * ((-smoothstep((screamEnd - 0.04), (screamEnd + 0.01), phase)) + 1.0));
    float screamProgress = clamp(((phase - screamStart) / (screamEnd - screamStart)), 0.0, 1.0);
    float screamVal = ((sin((screamProgress * 3.14159265359)) * 0.05) + 0.95);
    float collapseStart = float(0.714);
    float collapse = smoothstep((collapseStart - 0.04), (collapseStart + 0.03), phase);
    float collapseProgress = clamp(((phase - collapseStart) / ((-collapseStart) + 1.0)), 0.0, 1.0);
    float collapseFlash = (exp((collapseProgress * -20.0)) * 0.25);
    float flutter = ((sin((collapseProgress * 40.0)) * exp((collapseProgress * -5.0))) * 0.08);
    float collapseVal = max((((collapseFlash + 0.95) * exp((collapseProgress * -4.5))) + flutter), 0.0);
    return ((((calmVal * calm) + (buildVal * build)) + (screamVal * scream)) + (collapseVal * collapse));
}
float hash2(vec2 _p0) {
    return fract((sin(dot(_p0, vec2(127.1, 311.7))) * 43758.5453));
}
float noise2d(vec2 _p0) {
    vec2 i = floor(_p0);
    vec2 f0 = fract(_p0);
    vec2 f = ((f0 * f0) * ((f0 * -2.0) + 3.0));
    float a = hash2(i);
    float b = hash2((i + vec2(1.0, 0.0)));
    float c = hash2((i + vec2(0.0, 1.0)));
    float d = hash2((i + vec2(1.0, 1.0)));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float hash1(float _p0) {
    return fract((sin(_p0) * 43758.5453123));
}
float noise1(float _p0) {
    float i = floor(_p0);
    float f0 = fract(_p0);
    float f = ((f0 * f0) * ((f0 * -2.0) + 3.0));
    return mix(hash1(i), hash1((i + 1.0)), f);
}
float waveform(float _p0, float _p1, float _p2, float _p3) {
    float baseFreq = float(3.0);
    float timeOsc = (_p1 * _p3);
    float harmonics = (_p2 * _p2);
    float wave = sin(((_p0 * (baseFreq * 6.28318530718)) + (timeOsc * 4.0)));
    float noiseAmount = smoothstep(0.7, 1.0, _p2);
    float threshold = ((smoothstep(0.8, 1.0, _p2) * -0.38) + 0.5);
    return clamp(((((((((wave + (sin((((_p0 * (baseFreq * 12.56637061436)) + (timeOsc * 3.0)) + 0.8)) * 0.12)) + ((sin((((_p0 * (baseFreq * 12.56637061436)) + (timeOsc * 6.0)) + 0.5)) * harmonics) * 0.5)) + (((sin((((_p0 * (baseFreq * 18.849555921540002)) + (timeOsc * 8.0)) + 1.2)) * harmonics) * harmonics) * 0.35)) + (((sin((((_p0 * (baseFreq * 31.4159265359)) + (timeOsc * 12.0)) + 2.1)) * harmonics) * harmonics) * 0.2)) + ((sin((((_p0 * (baseFreq * 43.98229715026)) - (timeOsc * 5.0)) + 3.7)) * pow(harmonics, 3.0)) * 0.15)) + ((((noise1(((_p0 * 40.0) + (timeOsc * 15.0))) - 0.5) * 2.0) * noiseAmount) * 0.6)) + (((((noise1(((_p0 * 80.0) - (timeOsc * 20.0))) - 0.5) * 2.0) * noiseAmount) * noiseAmount) * 0.3)) * ((_p2 * 0.45) + 0.05)), (-threshold), threshold);
}

void main() {
    vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 uv = (gl_FragCoord.xy / u_resolution);
    float t = u_time;
    float emotion = clamp((emotionCurve(t) * u_intensity), 0.0, 1.0);
    float hasMouse = step(0.0001, length(u_mouse));
    vec2 mouseShift = ((((u_mouse / u_resolution) - 0.5) * 0.3) * hasMouse);
    vec3 bg = mix(vec3(0.02, 0.01, 0.04), vec3(0.06, 0.01, 0.01), emotion);
    float centerDist = length((uv - vec2(0.5)));
    float bgGlow = exp(((centerDist * centerDist) * -3.0));
    vec3 bgGlowColor = mix(vec3(0.05, 0.02, 0.08), vec3(0.12, 0.02, 0.02), emotion);
    vec3 background = (bg + ((bgGlowColor * bgGlow) * ((emotion * 0.5) + 0.3)));
    float noiseIntensity = smoothstep(0.6, 1.0, emotion);
    float screenNoise = ((((noise2d(((gl_FragCoord.xy * 0.8) + (t * 100.0))) - 0.5) * noiseIntensity) * 0.15) + ((((noise2d(((gl_FragCoord.xy * 2.5) + (t * 200.0))) - 0.5) * noiseIntensity) * noiseIntensity) * 0.08));
    float chromatic = ((smoothstep(0.5, 1.0, emotion) * 0.025) * u_intensity);
    float jitter = ((smoothstep(0.85, 1.0, emotion) * (noise1((t * 30.0)) - 0.5)) * 0.015);
    float glitchAmount = smoothstep(0.8, 1.0, emotion);
    float glitchBand = step(0.92, noise1((floor((uv.y * 25.0)) + (floor((t * 8.0)) * 7.3))));
    float glitchOffset = (((glitchBand * glitchAmount) * (noise1(((t * 50.0) + (uv.y * 10.0))) - 0.5)) * 0.06);
    float waveX = ((uv.x + glitchOffset) - mouseShift.x);
    float yCenter = (((uv.y - 0.5) + jitter) - mouseShift.y);
    float waveR = waveform((waveX - chromatic), t, emotion, u_waveSpeed);
    float waveG = waveform(waveX, t, emotion, u_waveSpeed);
    float waveB = waveform((waveX + chromatic), t, emotion, u_waveSpeed);
    float distR = abs((yCenter - waveR));
    float distG = abs((yCenter - waveG));
    float distB = abs((yCenter - waveB));
    float thickness = ((emotion * 0.004) + 0.003);
    float glowRadius = ((emotion * 0.038) + 0.022);
    float bloomRadius = ((emotion * 0.14) + 0.08);
    float buildPhase = smoothstep(0.1, 0.6, emotion);
    float screamPhase = smoothstep(0.7, 0.95, emotion);
    vec3 calmColor = vec3(0.62, 0.42, 0.88);
    vec3 buildColor = vec3(0.95, 0.2, 0.6);
    vec3 coreColor = mix(mix(calmColor, buildColor, buildPhase), vec3(1.0, 0.95, 0.9), screamPhase);
    vec3 glowColor = mix(mix((calmColor * 0.6), (buildColor * 0.7), buildPhase), vec3(1.0, 0.25, 0.1), screamPhase);
    float coreR = smoothstep(thickness, 0.0, distR);
    float coreG = smoothstep(thickness, 0.0, distG);
    float coreB = smoothstep(thickness, 0.0, distB);
    float glowDenom = (glowRadius * glowRadius);
    float bloomDenom = (bloomRadius * bloomRadius);
    float glowR = exp(((-(distR * distR)) / glowDenom));
    float glowG = exp(((-(distG * distG)) / glowDenom));
    float glowB = exp(((-(distB * distB)) / glowDenom));
    float bloomR = exp(((-(distR * distR)) / bloomDenom));
    float bloomG = exp(((-(distG * distG)) / bloomDenom));
    float bloomB = exp(((-(distB * distB)) / bloomDenom));
    float coreBright = ((smoothstep(0.8, 1.0, emotion) * 1.5) + 2.0);
    vec3 unifiedColor = ((((coreColor * coreG) * coreBright) + ((glowColor * glowG) * 0.9)) + ((glowColor * bloomG) * 0.35));
    vec3 splitColor = vec3(((((coreColor.r * coreR) * coreBright) + ((glowColor.r * glowR) * 0.9)) + ((glowColor.r * bloomR) * 0.35)), ((((coreColor.g * coreG) * coreBright) + ((glowColor.g * glowG) * 0.9)) + ((glowColor.g * bloomG) * 0.35)), ((((coreColor.b * coreB) * coreBright) + ((glowColor.b * glowB) * 0.9)) + ((glowColor.b * bloomB) * 0.35)));
    vec3 waveColor = mix(unifiedColor, splitColor, smoothstep(0.4, 0.9, emotion));
    float belowCenter = (uv.y - 0.5);
    float reflectionY = ((((-uv.y) + 1.0) - 0.5) + jitter);
    float reflectionDist = abs((reflectionY - waveG));
    float reflectionFade = ((step(0.0, belowCenter) * ((-smoothstep(0.0, 0.35, belowCenter)) + 1.0)) * 0.2);
    float reflectionGlow = exp(((-(reflectionDist * reflectionDist)) / (glowDenom * 3.0)));
    float reflectionBloom = exp(((-(reflectionDist * reflectionDist)) / (bloomDenom * 2.5)));
    vec3 reflectionColor = ((((glowColor * reflectionGlow) * 0.45) + ((glowColor * reflectionBloom) * 0.12)) * reflectionFade);
    vec3 color = ((background + waveColor) + reflectionColor);
    float scanline = (smoothstep(0.8, 1.0, emotion) * 0.08);
    float scan = ((sin((gl_FragCoord.xy.y * 1.5)) * 0.5) + 0.5);
    vec2 vigUv = (uv - 0.5);
    float vignette = clamp(((dot(vigUv, vigUv) * -1.8) + 1.0), 0.0, 1.0);
    float pulse = (((smoothstep(0.85, 1.0, emotion) * sin((t * 25.0))) * 0.15) + 1.0);
    fragColor = vec4(pow(max((((((color * ((-(scanline * scan)) + 1.0)) + vec3(screenNoise)) * ((vignette * 0.5) + 0.5)) * pulse) / ((((((color * ((-(scanline * scan)) + 1.0)) + vec3(screenNoise)) * ((vignette * 0.5) + 0.5)) * pulse) * 0.4) + 1.0)), vec3(0.0)), vec3(0.95)), 1.0);
}

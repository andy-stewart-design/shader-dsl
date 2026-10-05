import {
     defineUniforms,
     floor,
     fract,
     length,
     max,
     min,
     mix,
     smoothstep,
     step,
     vec2,
     vec3,
     vec4,
   } from "shdr";

   export default defineUniforms((u) => ({
     dpi: u.f32(8),
     spread: u.f32(0.32),
     blur: u.f32(0.08),
   })).createFragmentShader(({ coord, uniforms }) => {
     // Shdr coordinates and mouse are top-left; GLSL inputs here are bottom-left.
     const frag = vec2(coord.x, uniforms.resolution.y - coord.y);
     const inputMouse = vec2(
       uniforms.mouse.x,
       uniforms.resolution.y - uniforms.mouse.y,
     );

     const uv0 = frag / uniforms.resolution;
     const mouse0 = mix(
       vec2(0.5),
       inputMouse / uniforms.resolution,
       step(0.0001, length(uniforms.mouse)),
     );
     const uv1 = uv0 * 2 - 1;
     const mouse1 = mouse0 * 2 - 1;
     const aspect = uniforms.resolution.x / uniforms.resolution.y;
     const aspectUv = vec2(uv1.x * aspect, uv1.y);
     const mouse = vec2(mouse1.x * aspect, mouse1.y);

     const cellUv = fract(aspectUv * uniforms.dpi) * 2 - 1;
     const cellIndex = floor(aspectUv * uniforms.dpi);
     const cellCenter = (cellIndex + 0.5) / uniforms.dpi;
     const distFromMouse = length(cellCenter - mouse);
     const spreadAmount = (1 - uniforms.spread) * 2.5 + 0.5;
     const darkFactor = min(distFromMouse * spreadAmount, 1);
     const blur = max(0.025, distFromMouse * uniforms.blur);
     const rad = 1 - distFromMouse;
     const d = 1 - smoothstep(rad - blur, rad + blur, length(cellUv));
     const rg = 0.75 - distFromMouse * 0.75;
     const color = vec3(rg, rg, 1) * d - darkFactor;
     return vec4(color, 1);
   });

import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import inline from "../src/custom-demo-inline.shdr.ts";
import named from "../src/custom-demo-named.shdr.ts";

declare const canvas: HTMLCanvasElement;
async function staticHost() {
  const gl = await createWebGlRenderer(canvas, inline, {
    animate: false,
    uniforms: { color: [0.1, 0.3, 0.5], gain: 0.2 },
  });
  const gpu = await createWebGpuRenderer(canvas, named);
  gl.setUniforms({ color: [0.7, 0.2, 0.3], gain: 0.8 });
  await gl.draw();
  gl.resetUniforms("gain");
  gl.resetUniforms();
  await gl.setShader(named);
  await gpu.setShader(inline);
  // @ts-expect-error A static shader only accepts declared names.
  gl.setUniforms({ unknown: 1 });
  // @ts-expect-error A vector must have three components.
  gpu.setUniforms({ color: [1, 2] });
  // @ts-expect-error Shader scalar values must be numbers.
  gl.setUniforms({ gain: "0.5" });
  // @ts-expect-error Automatic uniforms cannot be set by the host.
  gpu.setUniforms({ time: 1 });
  // @ts-expect-error Reset names come from the static schema.
  gl.resetUniforms("unknown");
  // @ts-expect-error Unknown creation-time uniform.
  await createWebGlRenderer(canvas, inline, { uniforms: { other: 1 } });
  gl.dispose();
  gpu.dispose();
}
void staticHost;

import type { CompiledFragmentArtifact } from "shdr";
import { createFragmentShader, defineUniforms, vec4 } from "shdr";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import shader from "./fixtures/custom.shdr.js";

declare const canvas: HTMLCanvasElement;
const same = defineUniforms((u) => ({
  color: u.vec3(1, 0, 0),
  dpi: u.f32(0.5),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.dpi, uniforms.dpi, uniforms.dpi),
);
const noCustom = createFragmentShader(({ uniforms }) =>
  vec4(uniforms.time, uniforms.time, uniforms.time, uniforms.time),
);
const different = defineUniforms((u) => ({
  color: u.f32(1),
  dpi: u.f32(1),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color, uniforms.dpi, uniforms.dpi, uniforms.dpi),
);
const extra = defineUniforms((u) => ({
  color: u.vec3(0, 0, 0),
  dpi: u.f32(1),
  spin: u.f32(0),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.dpi, uniforms.spin, uniforms.dpi),
);

async function staticHost(): Promise<void> {
  const empty = await createWebGlRenderer(canvas, noCustom);
  // @ts-expect-error No custom uniforms are available.
  empty.setUniforms({ dpi: 1 });
  // @ts-expect-error No custom names are available to reset.
  empty.resetUniforms("dpi");
  // @ts-expect-error Cannot replace a typed no-custom shader with a different schema.
  await empty.setShader(shader);
  // @ts-expect-error Cannot send a constructor override to a no-custom shader.
  await createWebGlRenderer(canvas, noCustom, { uniforms: { dpi: 1 } });
  empty.dispose();
  for (const create of [createWebGlRenderer, createWebGpuRenderer] as const) {
    // Overloaded functions cannot be called through a union; exercise each below.
    void create;
  }
  const gl = await createWebGlRenderer(canvas, shader, {
    animate: false,
    uniforms: { color: [0, 1, 0], dpi: 1 },
  });
  const gpu = await createWebGpuRenderer(canvas, shader, {
    uniforms: { dpi: 0.5 },
  });
  gl.setUniforms({ dpi: 0.5 });
  gpu.setUniforms({ color: [0.1, 0.2, 0.3] });
  gl.resetUniforms("dpi", "color");
  gpu.resetUniforms();
  await gl.setShader(same);
  await gpu.setShader(same);
  // @ts-expect-error Unknown field in a variable is not permitted.
  gl.setUniforms({ dpi: 1, missing: 2 });
  const wrong = { dpi: 1, missing: 2 };
  // @ts-expect-error Exact keys are required even for variables.
  gpu.setUniforms(wrong);
  // @ts-expect-error A vector has exactly three components.
  gpu.setUniforms({ color: [1, 2] });
  // @ts-expect-error String is not a scalar value.
  gl.setUniforms({ dpi: "2" });
  // @ts-expect-error Automatic uniforms cannot be set.
  gl.setUniforms({ time: 1 });
  // @ts-expect-error Only declared names can be reset.
  gpu.resetUniforms("missing");
  // @ts-expect-error Same name with a changed type is incompatible.
  await gl.setShader(different);
  // @ts-expect-error Additional names are incompatible.
  await gpu.setShader(extra);
  // @ts-expect-error Wrong constructor value cannot bypass the static overload.
  await createWebGlRenderer(canvas, shader, { uniforms: { dpi: "1" } });
  await createWebGpuRenderer(canvas, shader, {
    // @ts-expect-error Unknown constructor key is rejected.
    uniforms: { dpi: 1, radius: 2 },
  });
  const plain: CompiledFragmentArtifact = shader;
  const erased = await createWebGlRenderer(canvas, plain);
  erased.setUniforms({ dpi: 1 });
  // @ts-expect-error Explicit erasure cannot permit unchecked constructor overrides.
  await createWebGlRenderer(canvas, plain, { uniforms: { dpi: 1 } });
  erased.dispose();
  gl.dispose();
  gpu.dispose();
}
async function dynamicHost(source: string): Promise<void> {
  const result = compileFragmentArtifact(source);
  if (!result.ok) return;
  const gl = await createWebGlRenderer(canvas, result.artifact, {
    uniforms: { color: [1, 0, 0] },
  });
  const gpu = await createWebGpuRenderer(canvas, result.artifact);
  await gl.setShader(shader);
  await gpu.setShader(result.artifact);
  gl.setUniforms({ dpi: 1, color: [1, 0, 0] });
  gpu.resetUniforms("dpi");
  // @ts-expect-error Dynamic values still must have a numeric shape.
  gl.setUniforms({ dpi: "1" });
  gl.dispose();
  gpu.dispose();
}
void staticHost;
void dynamicHost;

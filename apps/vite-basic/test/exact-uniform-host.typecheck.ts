import type { UniformDeclaration } from "shdr";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import inline from "../src/custom-demo-inline.shdr.ts";

declare const canvas: HTMLCanvasElement;
type DemoSchema = {
  readonly color: UniformDeclaration<"vec3">;
  readonly gain: UniformDeclaration<"f32">;
};

async function explicitSchemaWithExactOptionals() {
  await createWebGlRenderer<DemoSchema>(canvas, inline, {
    uniforms: { gain: 1 },
  });
  await createWebGpuRenderer<DemoSchema>(canvas, inline, { uniforms: {} });
  await createWebGlRenderer<DemoSchema>(canvas, inline, {
    // @ts-expect-error Exact optional properties reject present undefined, even with an explicit schema.
    uniforms: { gain: undefined },
  });
  await createWebGpuRenderer<DemoSchema>(canvas, inline, {
    // @ts-expect-error Exact optional properties reject undefined vectors.
    uniforms: { color: undefined },
  });
}
void explicitSchemaWithExactOptionals;

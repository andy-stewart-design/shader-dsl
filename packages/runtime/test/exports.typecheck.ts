import type { CompiledFragmentArtifact } from "shdr";
import { ShdrRuntimeError } from "@shdr/runtime/errors";
import type {
  Renderer,
  RendererOptions,
  ShaderInstallResult,
} from "@shdr/runtime/types";
import { WebGlRenderer, createWebGlRenderer } from "@shdr/runtime/webgl";
import { WebGpuRenderer, createWebGpuRenderer } from "@shdr/runtime/webgpu";
// @ts-expect-error Validated internal options are not exported from the public type entry.
import type { InternalRendererOptions } from "@shdr/runtime/types";

declare const artifact: CompiledFragmentArtifact;
declare const canvas: HTMLCanvasElement;
declare const options: RendererOptions;

const glFactory: typeof WebGlRenderer.create = createWebGlRenderer;
const gpuFactory: typeof WebGpuRenderer.create = createWebGpuRenderer;
const webgl: Promise<Renderer> = createWebGlRenderer(canvas, artifact, options);
const webgpu: Promise<Renderer> = createWebGpuRenderer(
  canvas,
  artifact,
  options,
);
async function consume(renderer: Renderer): Promise<ShaderInstallResult> {
  try {
    await renderer.draw();
    return await renderer.setShader(artifact);
  } catch (error) {
    if (error instanceof ShdrRuntimeError) {
      const kind:
        | "shader"
        | "draw"
        | "lost"
        | "artifact"
        | "uniform"
        | "disposed"
        | "unavailable"
        | "surface"
        | "aborted" = error.kind;
      void kind;
    }
    throw error;
  } finally {
    renderer.dispose();
  }
}
// @ts-expect-error Shader source strings are not compiled artifacts.
void createWebGlRenderer(canvas, artifact.glsl);
// @ts-expect-error Custom resource binding is outside v1.
void artifact.customUniforms;
void glFactory;
void gpuFactory;
void webgl;
void webgpu;
void (undefined as unknown as InternalRendererOptions);
void consume;

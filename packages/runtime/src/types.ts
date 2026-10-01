import type { CompiledFragmentArtifact, ShaderDefaultUniform } from "shdr";
import type { ShdrRuntimeError } from "./errors.js";

export interface RendererOptions {
  readonly animate?: boolean;
  readonly onError?: (error: ShdrRuntimeError) => void;
  readonly signal?: AbortSignal;
  /** Optional shared initial time origin, in performance.now() milliseconds. */
  readonly startedAt?: number;
}
export interface ShaderInstallOptions {
  /** Optional shared time origin, in performance.now() milliseconds. */
  readonly startedAt?: number;
}
export type ShaderInstallResult =
  | {
      readonly status: "installed";
      readonly boundUniforms: readonly ShaderDefaultUniform[];
      readonly warnings: readonly string[];
    }
  | { readonly status: "superseded" };
export interface Renderer {
  setShader(
    artifact: CompiledFragmentArtifact,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
  cancelPendingShader(): void;
  setPointerNormalized(x: number, y: number): void;
  draw(): Promise<void>;
  dispose(): void;
}

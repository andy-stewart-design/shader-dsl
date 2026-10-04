import type {
  CompiledFragmentArtifact,
  HostUniforms,
  ShaderDefaultUniform,
  TypedCompiledFragmentArtifact,
  UniformSchema,
} from "shdr";
import type { UniformPatch } from "./uniforms.js";
import type { ShdrRuntimeError } from "./errors.js";

export interface RendererOptions {
  readonly animate?: boolean;
  readonly onError?: (error: ShdrRuntimeError) => void;
  readonly signal?: AbortSignal;
  /** Optional shared initial time origin, in performance.now() milliseconds. */
  readonly startedAt?: number;
}
export interface InternalRendererOptions extends RendererOptions {
  readonly uniforms?: UniformPatch;
}
// Validate each supplied key against the required value type. Partial alone
// allows { gain: undefined } in consumer projects without exact optional types.
type CheckedStaticUniforms<
  S extends UniformSchema,
  V extends Partial<HostUniforms<S>>,
> = V & {
  readonly [K in keyof V]-?: K extends keyof S ? HostUniforms<S>[K] : never;
};

export type StaticRendererOptions<
  S extends UniformSchema,
  V extends Partial<HostUniforms<S>> = never,
> = RendererOptions & {
  // With an explicit S alone, TypeScript defaults V instead of inferring it.
  // Preserve partial options in that case. Under non-exact optional property
  // settings, Partial permits present undefined; runtime validation rejects it.
  // Inferred or explicit V still checks each supplied value statically.
  readonly uniforms?: [V] extends [never]
    ? Partial<HostUniforms<S>>
    : CheckedStaticUniforms<S, V>;
};
export type DynamicRendererOptions = RendererOptions & {
  readonly uniforms?: UniformPatch;
};
export type LegacyRendererOptions = RendererOptions & {
  readonly uniforms?: never;
};
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
  setUniforms(values: UniformPatch): void;
  resetUniforms(...names: readonly string[]): void;
  setPointerNormalized(x: number, y: number): void;
  draw(): Promise<void>;
  dispose(): void;
}
export interface StaticRenderer<S extends UniformSchema> extends Pick<
  Renderer,
  "cancelPendingShader" | "setPointerNormalized" | "draw" | "dispose"
> {
  setShader(
    artifact: TypedCompiledFragmentArtifact<S>,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
  setUniforms<const V extends Partial<HostUniforms<S>>>(
    values: CheckedStaticUniforms<S, V>,
  ): void;
  resetUniforms(...names: readonly (keyof S & string)[]): void;
}

# Runtime API — frozen v1 surface (gate 0)

Status: API design, with the phase 1 artifact/compiler and phase 2 renderer entries implemented locally. This fixes the provisional choices in the [spec](./spec.md) for [phase 0 of the plan](./plan.md). [`contract.typecheck.ts`](./contract.typecheck.ts) checks their real source types; workspace subpaths are tested separately. Host migration remains phase 3.

## Packages and imports

| Import                 | Exports                                                                                                   | Runtime dependency rule                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shdr`                 | `CompiledFragmentArtifact`, `ShaderDefaultUniform` **types**, and the existing DSL `createFragmentShader` | An authored `.shdr.ts` module's default export is typed `CompiledFragmentArtifact`; execution without the Vite transform still throws. No branded GLSL string compatibility export.                                                              |
| `@shdr/core/browser`   | `compileFragmentArtifact(source: string): CompileArtifactResult` and result types                         | Explicit opt-in browser compiler. It imports parser/lowering/generators. The Vite plugin can call the same operation at build time; the static runtime does **not** import it. Existing `@shdr/core` functions and diagnostics remain available. |
| `@shdr/runtime/webgl`  | `createWebGlRenderer` and `WebGlRenderer` type                                                            | WebGL 2 only; no other renderer or compiler value import.                                                                                                                                                                                        |
| `@shdr/runtime/webgpu` | `createWebGpuRenderer` and `WebGpuRenderer` type                                                          | WebGPU only; no other renderer or compiler value import.                                                                                                                                                                                         |
| `@shdr/runtime/errors` | `ShdrRuntimeError` and `RuntimeErrorKind`, `RendererBackend` types                                        | Small shared error implementation only; safe for both backends to import.                                                                                                                                                                        |
| `@shdr/runtime/types`  | `RendererOptions`, `ShaderInstallOptions`, `ShaderInstallResult`, `Renderer` types                        | Type-only contract; imports artifact/default types from `shdr` via `import type`. No runtime/root barrel that imports both backends.                                                                                                             |

No implicit backend selection. The `@shdr/runtime` workspace package has only subpath exports in v1; it is not an npm-release decision. The artifact and its type are in the existing lightweight `shdr` package so neither the browser renderers nor a static consumer needs a value import of `@shdr/core`. Require exact build-time Vite transformation for authored shader modules; direct execution still fails deliberately.

## Values and failure channels

```ts
interface CompiledFragmentArtifact {
  readonly glsl: string;
  readonly wgsl: string;
  readonly defaults: {
    readonly glsl: readonly ShaderDefaultUniform[];
    readonly wgsl: readonly ShaderDefaultUniform[];
  };
}
type ShaderDefaultUniform = "resolution" | "mouse" | "time";

type CompileArtifactResult =
  | {
      readonly ok: true;
      readonly artifact: CompiledFragmentArtifact;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly artifact?: undefined;
      readonly diagnostics: readonly ShaderDiagnostic[];
    };
```

`ShaderDiagnostic` is the existing `@shdr/core` type with code, message, original-source range and severity. Compilation returns diagnostics instead of throwing for invalid Shdr source. Vite converts the same failure to the existing source-located build error. The artifact is JSON-serializable, immutable **by contract**, with `resolution`, `mouse`, `time` ordered deterministically within each present subset. GLSL's implicit resolution for `coord` is recorded in `defaults.glsl`; WGSL does not implicitly add it. Renderer code checks artifact shape/metadata at the boundary; metadata describes only built-in bindings, not custom resources.

```ts
type RendererBackend = "webgl" | "webgpu";
type RuntimeErrorKind =
  | "unavailable" // API, adapter, device or context acquisition unavailable
  | "surface" // incompatible/already-claimed canvas or configuration failure
  | "artifact" // malformed artifact/unsupported binding metadata
  | "shader" // generated GLSL/WGSL, linking or pipeline creation
  | "draw" // submission/validation/frame failure
  | "lost" // terminal WebGL context or WebGPU device loss
  | "aborted" // creation cancelled via AbortSignal
  | "disposed"; // operation on disposed renderer
class ShdrRuntimeError extends Error {
  readonly backend: RendererBackend;
  readonly kind: RuntimeErrorKind;
  readonly cause?: unknown;
}
```

A failed `createWebGlRenderer` or `createWebGpuRenderer` **rejects** with `ShdrRuntimeError`, including failure of its first draw. Both functions return `Promise<Renderer>` even though WebGL setup can run synchronously internally. Replacement `setShader` rejects for the current candidate's artifact/shader/draw/loss failure; it leaves a valid previous shader and its clock intact. Earlier pending installations resolve `{ status: "superseded" }` (also when invalid Shdr source cancels a pending install); they do not reject or change the canvas/status. A successful installation resolves `{ status: "installed", boundUniforms, warnings }`, after its first real draw. Compiler diagnostics are **never** backend errors, and generated-code errors are **never** disguised as source-located Shdr diagnostics.

`draw(): Promise<void>` performs one draw, refreshes size/pointer/time and rejects with a typed error on observable validation/submission failure. WebGPU validation scopes used by both manual draw and installation must be serialized correctly. The animation loop catches draw failures and calls `options.onError(error)` instead of allowing an unhandled RAF rejection; it stops on failure until a successful replacement or disposal. Unexpected asynchronous device/context failures use this same callback. Terminal loss stops all work and invalidates the renderer; no automatic recovery. No `onError` callback for a failure already delivered by a rejected creation/replacement/manual draw. Make `onError` exception-safe so a host callback cannot create an unhandled RAF rejection. `dispose(): void` is repeatable; subsequent asynchronous operations reject `disposed` and synchronous coordination methods throw it. After both loss and disposal, `disposed` takes precedence. An optional `options.signal` cancels in-flight asynchronous **creation** and releases acquired resources; it rejects with `aborted`. Host unmount code still disposes a renderer if creation resolves after its UI is gone. No `AbortSignal` is required for normal use.

## Lifetime and the narrow coordination hook

```ts
interface RendererOptions {
  readonly animate?: boolean; // default true
  readonly onError?: (error: ShdrRuntimeError) => void;
  readonly signal?: AbortSignal; // creation only
  readonly startedAt?: number; // shared initial epoch, otherwise commit time
}
interface ShaderInstallOptions {
  readonly startedAt?: number; // performance.now() milliseconds; REPL synchronization only
}
type ShaderInstallResult =
  | {
      readonly status: "installed";
      readonly boundUniforms: readonly ShaderDefaultUniform[];
      readonly warnings: readonly string[];
    }
  | { readonly status: "superseded" };
interface Renderer {
  setShader(
    artifact: CompiledFragmentArtifact,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
  cancelPendingShader(): void;
  setPointerNormalized(x: number, y: number): void;
  draw(): Promise<void>;
  dispose(): void;
}
```

`createWebGlRenderer(canvas, artifact, options?)` and `createWebGpuRenderer(canvas, artifact, options?)` have the same awaitable signature, take exclusive ownership of a **dedicated** `HTMLCanvasElement`, install the shader, render the first frame and return the renderer. The initial shader cannot be superseded before creation resolves; an aborted create rejects and cleans up. A new shader resets elapsed time only on successful install; by default the new epoch is taken **at commit**, not when compilation was requested. The opt-in `startedAt` permits the REPL to pass one epoch for two installations despite asynchronous WebGPU preparation. Creation uses its successful installation time by default; the REPL may pass the same `startedAt` in both creation options for its first frames and in subsequent `setShader` calls. Shared elapsed time is approximate, not frame-exact. Within one installation, elapsed time is nondecreasing and nonnegative (clamp before writing uniforms if an explicitly supplied epoch is in the future); it resets for a successful replacement.

Each renderer automatically tracks its own canvas pointer from `(0, 0)` and keeps the last position on leave. Coordinates are top-left normalized fractions clamped to `[0, 1]` before conversion to current physical drawing-buffer pixels. `setPointerNormalized` is the **only** optional mouse coordination override: a REPL pointer handler forwards normalized movement over either preview to both renderers. Automatic tracking stays enabled, so a static one-canvas user need not call this. This is not a general uniform setter. `cancelPendingShader()` is the corresponding narrow hook when new source is invalid **before** a new artifact exists; it invalidates pending installs without discarding the last good shader, epoch or animation. `setShader` itself supersedes earlier pending installs. After loss/disposal no method submits further frames.

With `{ animate: false }` there is no RAF loop and no spontaneous pointer/resize draw; creation and successful replacement still draw once, and `draw()` refreshes the inputs. With animation on, a single owned RAF loop refreshes them continuously. Resizing a canvas or losing its context may clear the previous image despite retaining the installed shader object; last-frame preservation is promised only for a failed replacement on a valid unchanged surface. WebGL requests `alpha: false` and WebGPU uses `alphaMode: "opaque"`; alpha below 1 does not make the canvas translucent over the page.

## Typed usage to preserve

The independently type-checked [`contract.typecheck.ts`](./contract.typecheck.ts) uses real source-relative imports (the plan directory is not a linked workspace package). Workspace subpaths are verified by package tests. In the eventual Vite fixture, an authored `import effect from "./effect.shdr.ts"` must infer the artifact type **without** a per-file ambient module declaration; a WebGL-only static app must not bundle the parser or WebGPU renderer.

**Gate 0 complete when:** this file and the type-check fixture pass format, link and TS 7 checks, and the API choices above are reviewed. Do not implement shader/runtime behavior as part of phase 0.

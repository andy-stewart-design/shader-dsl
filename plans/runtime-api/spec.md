# Browser runtime API — v1 contract

Status: agreed v1 design, implemented and tested in this workspace; **not published**. This follows the completed [REPL WebGPU plan](../_completed/repl-webgpu/plan.md) and the separate [runtime/resource follow-ups](../notes.md). V1 is for the current fragment-only Shdr language; it does not add shader syntax.

## Agreed decisions

- **Two ways to produce one artifact:** the Vite transform compiles a `.shdr.ts` import at build time; an opt-in browser compiler compiles edited Shdr source at runtime. Both return the same dual-target artifact. The ordinary built-app path ships neither the Shdr parser nor compiler to the browser; an interactive REPL intentionally loads them (preferably in a separate/lazy chunk).
- **Break the existing Vite import shape:** a default `.shdr.ts` import becomes an artifact rather than a GLSL string. This is alpha software; update the types, fixture and examples rather than preserving the old string import as another public mode. Including **both** generated shader strings in a one-backend consumer is acceptable for v1. Separate renderer entry points, not target-specific shader imports, are the initial bundle-size boundary.
- **Explicit target selection:** expose separate WebGL 2 and WebGPU creation functions/entry points. Importing one must not pull in the other's renderer or the browser compiler. Neither silently switches backend on failure; the host chooses a renderer and handles `unavailable` explicitly. A canvas cannot host both context types.
- **Renderer-owned surface:** a renderer exclusively owns its dedicated canvas and WebGL context or WebGPU device/context, drawing resources and cleanup. No injection of an existing device, context, render pass or texture target in v1.
- **Automatic operation by default:** animation is on unless `{ animate: false }`. The renderer owns/cancels its `requestAnimationFrame` loop. With animation off, `draw()` is available; creation or a successful shader replacement still draws an initial frame. After disposal or terminal context/device loss it submits no more frames.
- **Automatic default uniforms:** `resolution` is the canvas drawing-buffer size in physical pixels (CSS size × device pixel ratio); `mouse` comes from canvas pointer movement, uses the same physical-pixel space with a top-left origin (+X right, +Y down); `time` advances in seconds from the most recent successful shader install. The host does not have to drive these. Resizing and pointer/clock updates work with animation on and are refreshed on explicit draws when it is off.
- **Opaque presentation in v1:** match the REPL's WebGL `alpha: false` and WebGPU `alphaMode: "opaque"`. Shader alpha is still compiled/evaluated, but `vec4(..., 0.5)` does **not** make the canvas translucent over the page. Transparent compositing needs its own cross-backend alpha/blending contract and tests; record it as a follow-up, not a silent v1 feature.
- **Terminal loss:** on WebGPU device loss, stop drawing, report the error and require the host to dispose/recreate the renderer; no automatic device/pipeline recovery in v1. Apply the same no-hidden-recovery principle to WebGL context loss.
- **Workspace gate first:** implement and test typed workspace exports, the Vite fixture and REPL integration before any npm publishing/release workflow. Do not treat a repo-local API as a shipped package.

## Artifact and compiler boundary

A successful compilation yields a serializable, immutable-by-contract fragment artifact, conceptually:

```ts
interface CompiledFragmentArtifact {
  readonly glsl: string; // GLSL ES 3.00 fragment source
  readonly wgsl: string; // WGSL fragment source
  readonly defaults: {
    readonly glsl: readonly ("resolution" | "mouse" | "time")[];
    readonly wgsl: readonly ("resolution" | "mouse" | "time")[];
  };
}
```

The exact exported type name is provisional. Generate both strings from **one** target-neutral lowering pass, and derive any small binding metadata from that pass rather than parsing generated WGSL in the public runtime. GLSL may implicitly need `resolution` when `coord` is referenced to convert `gl_FragCoord.y`; WGSL uses fragment position directly and must not gain an implicit binding. Only referenced default uniforms are bound, retaining WGSL group 0 bindings 0 (`resolution`), 1 (`mouse`) and 2 (`time`) when others are omitted. Do not add custom-resource metadata before its host-facing contract exists.

Vite transforms the authored module at build time and exports the artifact as data. Compilation failures remain build errors with original-source Shdr diagnostics. An explicitly imported browser compiler accepts source text and returns a success artifact or original-source diagnostics; it does not run the source as JavaScript. Rendering either artifact does not require importing that compiler. Generated GLSL/WGSL compiler, pipeline and device errors belong to the runtime backend and are **not** presented as source-mapped Shdr diagnostics; generated-to-source attribution remains separate work.

## Renderer lifecycle and errors

Illustrative shape (names, result/error types and exact package subpaths to finalize with typed tests; do not introduce an auto-select facade):

```ts
import shader from "./effect.shdr.ts";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
// or: import { createWebGpuRenderer } from "@shdr/runtime/webgpu";

const renderer = await createWebGlRenderer(canvas, shader, { animate: true });
await renderer.setShader(nextArtifact); // REPL/hot-reload path
renderer.draw(); // especially with animate: false
renderer.dispose();
```

Creation may be async for WebGPU; a consistent awaitable surface for WebGL is acceptable. Both renderers accept the **same artifact**, use only their own target string, and validate/install the selected shader before reporting successful rendering. Shader replacement is supported: prepare before committing; on failure retain the last successful shader and clock when the surface is still valid. Later async replacements must supersede earlier ones; obsolete pipelines/buffers cannot commit, render over newer results or overwrite their status. Invalid Shdr source fails at the compiler boundary and must not discard an installed shader.

Creation and replacement errors must be observable by the caller; asynchronous frame/context/device failures must have an explicit error notification path rather than becoming uncaught animation-frame exceptions. Distinguish unsupported WebGPU/adapter/device acquisition from shader compilation, pipeline, draw and terminal-loss failures. Calling `dispose()` stops animation/listeners, releases owned resources and invalidates pending work; repeated disposal is safe. A device/context loss invalidates the surface, so last-frame preservation is **not** promised there or across a resize that clears it. No automatic WebGPU-to-WebGL fallback, and a canvas already configured for one backend cannot be repurposed for the other.

Automatic pointer tracking begins at `(0, 0)` and retains the last position when the pointer leaves the canvas. The REPL must still be able to share one logical pointer and compile epoch across two owned canvases without weakening the automatic defaults for ordinary users; choose the smallest explicit coordination hook during implementation rather than a general custom-uniform setter. With `{ animate: false }`, pointer/resize changes do not themselves start a continuous loop; `draw()` picks up their current values. No promise of frame-exact cross-device clock or pixel equality is made.

## Implementation and verification gates

1. **Artifact/compiler contract:** freeze types and diagnostics, implement one lowering pass → both outputs and metadata, change the default Vite import (update `FragmentShaderSource`-typed consumers), and provide a separate browser compile entry. Verify that artifacts from both paths agree and that a production Vite app importing only a renderer and static shader does **not** bundle Babel Parser/compiler code. Measure both runtime entry-point bundles; both shader strings are expected.
2. **Target-specific renderers:** extract/harden the REPL renderers into isolated WebGL/WebGPU entries with the agreed lifecycle, opaque canvas, automatic uniforms, animation toggle/manual draw, atomic replacement and observable errors. Test default binding subsets, canvas sizing/DPR, pointer origin, time reset, stale async updates, failed replacement, context/device loss and disposal with real browser pixels. Test that importing either renderer does not pull in the other.
3. **Host integration:** migrate the Vite fixture to the new artifact, and migrate the REPL to the shared runtime using the opt-in browser compiler rather than duplicating renderer behavior. Verify the REPL's dual previews and shared mouse/time behavior, honest unavailable-WebGPU path, and compile/runtime diagnostic separation. Keep `pnpm build`, `pnpm check`, `pnpm test`, `pnpm ci:check` and focused browser/format checks passing. Stop for review before publishing or widening the resource/language scope.

## Explicit follow-ups, not v1 promises

- **Transparent canvas output:** decide straight versus premultiplied alpha, blending/compositing semantics and color-space behavior on both backends; test alpha below 1 in a real browser before claiming page transparency.
- **Custom uniforms:** design source types and a host update/binding API, including layout, defaults, lifetime and cross-target tests. Do not infer the design from today's three auto-managed defaults.
- Textures/samplers, host-owned GPU devices or render passes, offscreen targets, an automatic backend/fallback facade, native runtimes, generated-code-to-original-source backend-error mapping, and npm publishing each need separate review.

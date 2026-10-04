# @shdr/runtime (workspace-only)

Separate browser entries for **opaque**, dedicated WebGL 2 or WebGPU canvases. This package is not published. See the [v1 contract](../../plans/_completed/runtime-api/phase-0-contract.md) and [custom-uniform contract](../../plans/_completed/custom-uniforms/spec.md). Static Vite imports provide one artifact with `glsl`, `wgsl`, automatic bindings, and complete custom schema/default/reference metadata; importing a renderer does not import `@shdr/core` or the other renderer.

```ts
import shader from "./effect.shdr.ts";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
// Or choose createWebGpuRenderer from "@shdr/runtime/webgpu" explicitly.

const renderer = await createWebGlRenderer(canvas, shader, {
  animate: false,
  onError(error) {
    console.error(error.kind, error.message);
  },
}); // First frame already drawn.
await renderer.draw();
await renderer.setShader(shader); // Replaces only after a successful draw.
renderer.dispose();
```

Creation, replacement and manual-draw errors reject with `ShdrRuntimeError` from `@shdr/runtime/errors`. Later RAF/context/device errors call `onError`. `unavailable` does not trigger automatic backend fallback. Context/device loss is terminal: dispose and recreate with a **new dedicated canvas**. The canvas automatically supplies physical-pixel resolution, top-left physical-pixel mouse and elapsed seconds. `{ animate: false }` schedules no frame loop; pointer/resize changes take effect on a subsequent explicit draw. The canvas is opaque even if shader output alpha is below 1. The runtime does not write test-observability attributes to the canvas. The REPL's shared-pointer and shared-clock hooks are `setPointerNormalized`, `cancelPendingShader`, and the optional `startedAt` epoch; ordinary hosts do not need them.

Custom f32/vec2/vec3/vec4 uniforms use static shader defaults on the first frame. Override an instance's first frame with `{ uniforms: { gain: 0.2 } }`, update with `renderer.setUniforms({ gain: 0.8 })`, and restore the **current installed shader's** defaults with `renderer.resetUniforms("gain")` or `renderer.resetUniforms()` (one, many or all names). Updates are copied/validated atomically and drawn on the next animation frame or manual `draw()`; `setShader` draws automatically even with `{ animate: false }`. Static `.shdr.ts` imports infer names, scalar values and fixed-length numeric vector tuples; same-schema replacements may change defaults. Inferred static patches and creation overrides reject **present `undefined` fields** even if the consuming TypeScript project disables `exactOptionalPropertyTypes`; omit a field rather than setting it to `undefined` (narrow optional values before adding them to a patch). With an explicit schema type argument, e.g. `createWebGlRenderer<MySchema>(...)`, partial overrides remain valid. TypeScript cannot infer a second values type argument after an explicit first argument; under non-exact optional-property settings, such explicit-schema-only calls may permit `undefined` at type-check time, but the renderer rejects it at creation. Omit the explicit schema argument to retain inferred compile-time checking, or supply both schema and values type arguments. Explicit `setUniforms` values carry to replacements only when name **and type** still match; constructor-only overrides do not carry, and incompatible overrides are pruned. Browser-compiled editor artifacts can change schemas on the same renderer but validate names, vector lengths, finite f32 values and metadata at runtime. Invalid host values throw `ShdrRuntimeError` with kind `"uniform"`, malformed metadata with `"artifact"`. WebGL sets only active individual generated uniforms; WebGPU uses an aligned group 1/binding 0 custom struct if referenced while preserving automatic group 0 bindings 0/1/2. See the [feature contract](../../plans/_completed/custom-uniforms/spec.md) for concurrency and failure semantics.

Run `pnpm --filter @shdr/runtime build`, `pnpm --filter @shdr/runtime check` and `pnpm --filter @shdr/runtime test`. The browser suite validates real pixels, first-frame draws, binding subsets, pointer/DPR/time, failures/loss and bundle isolation in Chromium/SwiftShader. The [Vite fixture](../../apps/vite-basic/README.md#custom-uniform-demo) and [REPL](../../apps/repl/README.md#custom-uniforms-in-the-editor) exercise both backends with real pixels. Textures, other host resources and native runtimes remain out of scope.

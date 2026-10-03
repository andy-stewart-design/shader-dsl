# @shdr/runtime (workspace-only)

Separate browser entries for **opaque**, dedicated WebGL 2 or WebGPU canvases. This package is not published. See the [v1 contract](../../plans/_completed/runtime-api/phase-0-contract.md) and [custom-uniform contract](../../plans/custom-uniforms/spec.md). Static Vite imports provide one artifact with `glsl`, `wgsl` and referenced default-binding metadata; importing a renderer does not import `@shdr/core` or the other renderer.

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

Custom f32/vec2/vec3/vec4 uniforms use static shader defaults on the first frame. Override an instance's first frame with `{ uniforms: { dpi: 0.5 } }`, update with `renderer.setUniforms({ dpi: 0.8 })`, and restore the current shader's defaults with `renderer.resetUniforms("dpi")` or `renderer.resetUniforms()`. Updates are drawn on the next animation frame or manual `draw()`. Static imports infer names/types; browser-compiled shaders validate their schema at runtime. Invalid host values throw `ShdrRuntimeError` with kind `"uniform"`, malformed metadata with `"artifact"`. Explicit `setUniforms` values carry across compatible shader replacements; constructor overrides do not. See the [feature contract](../../plans/custom-uniforms/spec.md) for replacement and concurrency semantics.

Run `pnpm --filter @shdr/runtime build`, `pnpm --filter @shdr/runtime check` and `pnpm --filter @shdr/runtime test`. The browser suite validates real pixels, first-frame draws, binding subsets, pointer/DPR/time, failures/loss and bundle isolation in Chromium/SwiftShader. Vite fixture and REPL custom-uniform integration remain [phase 3](../../plans/custom-uniforms/plan.md).

# @shdr/runtime (workspace-only)

Separate browser entries for **opaque**, dedicated WebGL 2 or WebGPU canvases. This package is not published. See the [v1 contract](../../plans/runtime-api/phase-0-contract.md). Static Vite imports provide one artifact with `glsl`, `wgsl` and referenced default-binding metadata; importing a renderer does not import `@shdr/core` or the other renderer.

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

Creation, replacement and manual-draw errors reject with `ShdrRuntimeError` from `@shdr/runtime/errors`. Later RAF/context/device errors call `onError`. `unavailable` does not trigger automatic backend fallback. Context/device loss is terminal: dispose and recreate with a **new dedicated canvas**. The canvas automatically supplies physical-pixel resolution, top-left physical-pixel mouse and elapsed seconds. `{ animate: false }` schedules no frame loop; pointer/resize changes take effect on a subsequent explicit draw. The canvas is opaque even if shader output alpha is below 1. The REPL's shared-pointer and shared-clock hooks are `setPointerNormalized`, `cancelPendingShader`, and the optional `startedAt` epoch; ordinary hosts do not need them.

Run `pnpm --filter @shdr/runtime build`, `pnpm --filter @shdr/runtime check` and `pnpm --filter @shdr/runtime test`. The browser suite validates real pixels, first-frame draws, binding subsets, pointer/DPR/time, failures/loss and bundle isolation in Chromium/SwiftShader. Host migration remains [phase 3](../../plans/runtime-api/plan.md).

# Shdr browser REPL

A React/Vite fixture that runs `@shdr/core` directly in the browser. One semantic lowering pass produces both GLSL ES 3.00 and WGSL output from the same typed IR.

```sh
pnpm --filter repl dev
pnpm --filter repl build
```

Edit the source and choose **Compile both targets**, or press Ctrl/Command+Enter. To try all eleven math builtins together, paste the complete [math-builtin shader fixture](../vite-basic/src/math-builtins.shdr.ts) into the REPL; the [`ceil`/`distance`/`cross` fixture](../editor-fixture/geometry-math.shdr.ts) exercises the newer builtins, and the [expanded shader fixture](../../packages/core/test/fixtures/expanded.shdr.ts) separately exercises arithmetic, constructors and swizzles. The [language reference](../../README.md#accepted-shader-language) lists accepted and rejected expressions. Source diagnostics are shared by both backends. The generated GLSL renders in WebGL 2; on a WebGPU-capable browser the generated WGSL compiles to a pipeline and renders on a separate canvas. A WGSL status of **Rendered** follows a draw, not just module compilation. If WebGPU is unavailable, its preview reports **Unavailable** while WebGL 2 keeps working. Backend errors are separate from source-mapped Shdr diagnostics.

```sh
pnpm --filter repl test
```

The Chromium/SwiftShader browser test **requires WebGPU** and compares presented WebGPU canvas pixels against WebGL `readPixels` for the gradient (corners, center, top and bottom), expanded and finite/increasing-edge math fixtures, a constant with no bindings, implicit-GLSL-only resolution, mouse and advancing time. It uses ±5 RGBA levels for color/coordinate examples, ±8 for the finite math fixture, and ±2 for uniform constant-color or last-frame assertions—not bit identity. It checks physical-pixel DPR/resize and responsive stacking, time reset and advance, shared pointer motion over **either** canvas, no/some/all default bindings, invalid-source frame preservation, a deliberately failed WGSL pipeline, superseded and canceled asynchronous compiles, real device loss, and WebGL-only fallback contexts with missing WebGPU API **and** adapter. The independent renderer probe additionally tests selective binding indices and resource lifecycle.

A separate **Phase 1 feasibility probe** runs with `pnpm --filter repl test:webgpu-feasibility` (after `pnpm build`). It proves generated WGSL can draw to and read back pixels from a separate WebGPU canvas in the tested Chromium/SwiftShader environment, including position and resolution uniforms. See the [WebGPU REPL plan](../../plans/repl-webgpu/plan.md). The **renderer probe**, `pnpm --filter repl test:webgpu-renderer`, exercises the REPL-local `WebGpuRenderer` with canvas pixels, selective default uniforms, compilation/pipeline failures, superseded edits, disposal and device loss. The renderer now powers the second REPL preview; the Phase 4 browser parity test runs via `pnpm --filter repl test`.

## Runtime uniforms

- `resolution` is each drawing buffer's size in physical pixels. Both canvases use equal CSS dimensions and follow the device pixel ratio when rendered.
- `mouse` is the pointer position in those pixels with a top-left origin, +X right, and +Y down. Browser pointer coordinates enter this convention without a Y flip.
- `time` shares a compile epoch across both rendered targets and advances in seconds. A failed backend preserves its previous shader and clock. Browser tests compare slow time-driven channels within tolerances while checking that both clocks agree; this is not a claim of exact frame synchronization.

Only active default uniforms are bound per target. Pointer movement over either preview updates one normalized logical location, scaled to each drawing buffer. Referencing `coord` implicitly activates `resolution` for GLSL's `u_resolution.y - gl_FragCoord.y` conversion. WGSL uses its fragment-position built-in directly; omitted WGSL bindings keep their original indices. A backend error leaves its last successful shader visible when the surface is still valid; WebGPU device loss invalidates that surface. WGSL compilation/pipeline messages are backend messages, **not** source-mapped Shdr diagnostics. Custom uniforms, textures and a host-facing two-target runtime remain out of scope.

## Browser boundary and bundle observation

The production build audits `packages/core/src` for Node built-ins, Node globals, and filesystem calls. It also rejects Vite browser-external stubs and confirms the emitted browser bundle contains Babel Parser and both shader backends.

At Step 7.4, the production JavaScript bundle measured **618,142 bytes minified / 168,464 bytes gzip**. This is the complete single bundle containing React, Babel Parser, `@shdr/core`, and the GLSL and WGSL generators. The size is intentionally recorded rather than optimized during the POC.

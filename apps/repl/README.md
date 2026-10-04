# Shdr browser REPL

A React/Vite fixture that explicitly loads `@shdr/core/browser` for edited source. One semantic lowering pass produces the same dual-target GLSL ES 3.00/WGSL artifact as `@shdr/vite`; the two previews use the workspace-only `@shdr/runtime` WebGL 2 and WebGPU entries. [`use-shader-previews.ts`](src/use-shader-previews.ts) keeps async backend startup, replacement epochs, fallback and status coordination out of the editor UI; it is a REPL-local hook, not a public auto-select renderer.

```sh
pnpm --filter repl dev
pnpm --filter repl build
```

Edit the source and choose **Compile both targets**, or press Ctrl/Command+Enter. To try all eleven math builtins together, paste the complete [math-builtin shader fixture](../vite-basic/src/math-builtins.shdr.ts) into the REPL; the [`ceil`/`distance`/`cross` fixture](../editor-fixture/geometry-math.shdr.ts) exercises the newer builtins, and the [expanded shader fixture](../../packages/core/test/fixtures/expanded.shdr.ts) separately exercises arithmetic, constructors and swizzles. For `mix` and `step`, paste the [representative cells fixture](../vite-basic/src/cells-representative.shdr.ts) and move the pointer across either preview; its `dpi`/`spread`/`blur` defaults are static, and it is not an exact reference-GLSL port. The [language reference](../../README.md#accepted-shader-language) lists accepted and rejected expressions. Source diagnostics are shared by both backends. The generated GLSL renders in WebGL 2; on a WebGPU-capable browser the generated WGSL compiles to a pipeline and renders on a separate canvas. A WGSL status of **Rendered** follows a draw, not just module compilation. If WebGPU is unavailable, its preview reports **Unavailable** while WebGL 2 keeps working. Backend errors are separate from source-mapped Shdr diagnostics.

```sh
pnpm --filter repl test
```

The Chromium/SwiftShader browser test **requires WebGPU** and compares presented WebGPU canvas pixels against WebGL `readPixels` for the gradient (corners, center, top and bottom), expanded and finite/increasing-edge math fixtures, custom uniforms, a constant with no bindings, implicit-GLSL-only resolution, mouse and advancing time. It also compiles and renders the representative `mix`/`step` cells on both canvases, and checks that an invalid-factor edit preserves their frames; exact corresponding cells pixels are checked on borderless canvases by `packages/runtime/test/verify-mix-step.mjs`. It uses ±5 RGBA levels for color/coordinate examples, ±8 for the finite math fixture, and ±2 for uniform constant-color or last-frame assertions—not bit identity. It checks physical-pixel DPR/resize and responsive stacking, time reset and advance, shared pointer motion over **either** canvas, no/some/all default bindings, invalid-source frame preservation, a deliberately failed WGSL pipeline, superseded and canceled asynchronous compiles, real device loss, and WebGL-only fallback contexts with missing WebGPU API **and** adapter. The independent renderer probe additionally tests selective binding indices and resource lifecycle.

The historical feasibility probe still runs with `pnpm --filter repl test:webgpu-feasibility` (after `pnpm build`); see the [completed WebGPU REPL plan](../../plans/_completed/repl-webgpu/plan.md). The old REPL-only renderer and its probe have been removed. The independent [`@shdr/runtime` browser suite](../../packages/runtime/README.md) exercises binding subsets, opaque pixels, pointer/DPR/time, failure preservation, animation/manual drawing, aborted creation, loss, disposal and isolated bundles. Run it via `pnpm --filter @shdr/runtime test` (or `pnpm --filter repl test:webgpu-renderer`); the REPL parity suite runs via `pnpm --filter repl test`.

## Custom uniforms in the editor

Paste the [inline declaration](../vite-basic/src/custom-demo-inline.shdr.ts) or [named equivalent](../vite-basic/src/custom-demo-named.shdr.ts) into the source box and compile. These use static numeric f32/vec3 defaults. When their `color: vec3` and `gain: f32` schema is installed, **Set example uniforms** applies one fixed host update to each available renderer; **Reset custom defaults** clears all explicitly set overrides. These limited example buttons are not a general uniform-control panel. The REPL compiles arbitrary edited source with `@shdr/core/browser`, so the imported artifact is schema-erased: `setUniforms`/`resetUniforms` validate against the _currently installed_ shader at runtime. Static Vite imports instead retain names/types in TypeScript (see the [Vite fixture](../vite-basic/README.md#custom-uniform-demo)).

Editing defaults and recompiling replaces shaders on the same canvases. An explicit update carries across a matching name/type, even when defaults change; a changed type or absent name prunes the old override. Creation-time overrides do not carry. The test checks these flows via **real WebGL and presented WebGPU pixels**, plus invalid `u.f32(window.devicePixelRatio)` (`SHDR1210`) and unknown custom references (`SHDR1203`) preserving the last good frames. Invalid host names, vector lengths, non-finite numbers and f32 overflow throw `ShdrRuntimeError` kind `"uniform"`; source diagnostics are separate and keep original ranges. WebGPU-unavailable mode still renders the custom shader in WebGL 2. No authored `.shdr.ts` file is executed to obtain defaults.

## Runtime uniforms

- `resolution` is each drawing buffer's size in physical pixels. Both canvases use equal CSS dimensions and follow the device pixel ratio when rendered.
- `mouse` is the pointer position in those pixels with a top-left origin, +X right, and +Y down. Browser pointer coordinates enter this convention without a Y flip.
- `time` shares a compile epoch across both rendered targets and advances in seconds. A failed backend preserves its previous shader and clock. Browser tests compare slow time-driven channels within tolerances while checking that both clocks agree; this is not a claim of exact frame synchronization.

Only active automatic uniforms are bound per target. Pointer movement over either preview updates one normalized logical location, scaled to each drawing buffer. Referencing `coord` implicitly activates `resolution` for GLSL's `u_resolution.y - gl_FragCoord.y` conversion. WGSL uses its fragment-position built-in directly; omitted WGSL bindings keep their original indices. A backend error leaves its last successful shader visible when the surface is still valid; WebGPU device loss invalidates that surface. WGSL compilation/pipeline messages are backend messages, **not** source-mapped Shdr diagnostics. The reusable runtime uses **separate explicit backend entries**, not an auto-select two-target facade; textures and other custom resources remain out of scope.

## Browser boundary and bundle observation

The production build audits `packages/core/src` for Node built-ins, Node globals, and filesystem calls. It also rejects Vite browser-external stubs and confirms the emitted browser bundle contains Babel Parser and both shader backends.

The REPL deliberately includes the browser compiler (and Babel Parser); unlike a static Vite app, it is an interactive source editor. The build prints current minified/gzip sizes for the full React/compiler/backend bundle. The historical Step 7.4 measurement (**618,142 bytes minified / 168,464 bytes gzip**) is not a current size claim. Neither runtime nor compiler is published.

# Vite/WebGL 2 + WebGPU fixture

This app proves the `@shdr/vite` pre-transform from a `.shdr.ts` module to a dual-target artifact, rendered on separate opaque canvases by the workspace-only `@shdr/runtime/webgl` and `/webgpu` entries. WebGL 2 remains usable when WebGPU is unavailable; the host explicitly handles that failure rather than the runtime silently falling back. The development-only `src/browser-compiler-smoke.ts` verifies the opt-in browser compiler against the static artifact; it is not imported by the production app. The displayed `gradient.shdr.ts` is the minimal example; [`src/expanded.shdr.ts`](src/expanded.shdr.ts) exercises arithmetic, unary minus, `vec2`/`vec3`, and swizzles. A third canvas renders [`src/math-builtins.shdr.ts`](src/math-builtins.shdr.ts) through the same production transform. The [root language reference](../../README.md#accepted-shader-language) defines the supported subset.

## Custom-uniform demo

[`src/custom-demo-inline.shdr.ts`](src/custom-demo-inline.shdr.ts) declares `color: vec3` and `gain: f32` with literal defaults using `defineUniforms(...).createFragmentShader(callback)`; [`src/custom-demo-named.shdr.ts`](src/custom-demo-named.shdr.ts) uses the named same-file `const uniforms = defineUniforms(...); createFragmentShader(callback, { uniforms })` form with the **same name/type schema** but different defaults. The fixture renders these imports on dedicated opaque WebGL 2 and WebGPU canvases. Creation-time `uniforms` override the first frame without a flash. Buttons apply an explicit typed `setUniforms` patch, reset one or all fields, and replace the shader in both directions; replacement retains explicit compatible overrides, not the creation-only override. These are small host examples, not runtime-owned UI controls. `{ animate: false }` uses `draw()` for updates; a successful `setShader` draws its own first frame. The [separate TypeScript check](test/custom-uniform-host.typecheck.ts) proves static import inference and rejects bad names, values, vector lengths and automatic-uniform writes; the Vite build never executes `.shdr.ts` files to discover defaults.

```sh
pnpm --filter vite-basic dev
pnpm --filter vite-basic build
pnpm --filter vite-basic check # TypeScript 7 static-uniform host check
pnpm --filter vite-basic test:dev
pnpm --filter vite-basic test:render
```

The production build runs `verify-build.mjs`, which confirms that the browser bundle contains GLSL/WGSL artifact data and renderer code but **no parser/compiler or original shader DSL source**. A separate WebGL-only static build confirms that importing one renderer does not pull in WebGPU or the browser compiler. `check` typechecks the static host fixture with strict null checks under both `exactOptionalPropertyTypes` settings, including the rejection of present `undefined` uniform values. `test:dev` starts a real Vite development server, checks that the opt-in browser compiler matches both static authoring forms (and rejects dynamic defaults with original-source diagnostics), temporarily edits the named shader's default and expression, checks both regenerated target bodies and a reloaded WebGL pixel, and restores the source. `test:render` reads WebGL pixels and presented WebGPU canvas pixels in Chromium to verify creation overrides, resets, compatible replacement, math results, opaque alpha, top-left Y, and missing-WebGPU fallback (including the custom WebGL preview).

## TypeScript limitation

Do not run standalone `tsc --noEmit` over this fixture. TypeScript does not receive the Vite transform and therefore interprets shader operators as ordinary TypeScript. From the workspace root, run `pnpm shdr check apps/vite-basic/src` for shader-source diagnostics, `pnpm --filter vite-basic check` for the ordinary static host type fixture, and `pnpm check` for ordinary TypeScript projects. The Shdr CLI does not type-check ordinary code outside shader callbacks. Vite owns the `.shdr.ts` build transform, while the dedicated Shdr editor provider supplies shader diagnostics and hover information in VS Code.

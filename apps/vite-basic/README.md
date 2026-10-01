# Vite/WebGL 2 + WebGPU fixture

This app proves the `@shdr/vite` pre-transform from a `.shdr.ts` module to a dual-target artifact, rendered on separate opaque canvases by the workspace-only `@shdr/runtime/webgl` and `/webgpu` entries. WebGL 2 remains usable when WebGPU is unavailable; the host explicitly handles that failure rather than the runtime silently falling back. The development-only `src/browser-compiler-smoke.ts` verifies the opt-in browser compiler against the static artifact; it is not imported by the production app. The displayed `gradient.shdr.ts` is the minimal example; [`src/expanded.shdr.ts`](src/expanded.shdr.ts) exercises arithmetic, unary minus, `vec2`/`vec3`, and swizzles. A third canvas renders [`src/math-builtins.shdr.ts`](src/math-builtins.shdr.ts) through the same production transform. The [root language reference](../../README.md#accepted-shader-language) defines the supported subset.

```sh
pnpm --filter vite-basic dev
pnpm --filter vite-basic build
pnpm --filter vite-basic test:dev
pnpm --filter vite-basic test:render
```

The production build runs `verify-build.mjs`, which confirms that the browser bundle contains GLSL/WGSL artifact data and renderer code but **no parser/compiler or original shader DSL source**. A separate WebGL-only static build confirms that importing one renderer does not pull in WebGPU or the browser compiler. `test:dev` starts a real Vite development server, checks that the opt-in browser compiler matches the static artifact and returns original-source diagnostics, temporarily edits the shader, reloads it in Chromium, and restores the source. `test:render` reads WebGL pixels and presented WebGPU canvas pixels in Chromium to verify the static dual-backend path, math results, opaque alpha, top-left Y, and missing-WebGPU fallback.

## TypeScript limitation

Do not run standalone `tsc --noEmit` over this fixture. TypeScript does not receive the Vite transform and therefore interprets shader operators as ordinary TypeScript. From the workspace root, run `pnpm shdr check apps/vite-basic/src` for shader-source diagnostics and `pnpm check` for ordinary TypeScript projects. The Shdr CLI does not type-check ordinary code outside shader callbacks. Vite owns the `.shdr.ts` build transform, while the dedicated Shdr editor provider supplies shader diagnostics and hover information in VS Code.

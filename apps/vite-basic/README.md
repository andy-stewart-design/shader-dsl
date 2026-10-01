# Vite/WebGL 2 fixture

This app proves the `@shdr/vite` pre-transform from a `.shdr.ts` module to a dual-target artifact. The fixture renders its GLSL side using direct WebGL 2 code; the reusable renderer is future work. The development-only `src/browser-compiler-smoke.ts` verifies the opt-in browser compiler against the static artifact; it is not imported by the production app. The displayed `gradient.shdr.ts` is the minimal example; [`src/expanded.shdr.ts`](src/expanded.shdr.ts) exercises arithmetic, unary minus, `vec2`/`vec3`, and swizzles. A second canvas renders [`src/math-builtins.shdr.ts`](src/math-builtins.shdr.ts), exercising all eleven f32 math builtins through the same production transform. The [root language reference](../../README.md#accepted-shader-language) defines the supported subset.

```sh
pnpm --filter vite-basic dev
pnpm --filter vite-basic build
pnpm --filter vite-basic test:dev
pnpm --filter vite-basic test:render
```

The production build runs `verify-build.mjs`, which confirms that the bundle contains generated GLSL for all three shaders and no original shader DSL source. `test:dev` starts a real Vite development server, requests the transformed shader module, temporarily edits the shader, reloads it in Chromium, and restores the source. `test:render` reads gradient and math-builtin canvas pixels in Chromium to verify finite shader results, opaque alpha, and top-left-origin Y semantics.

## TypeScript limitation

Do not run standalone `tsc --noEmit` over this fixture. TypeScript does not receive the Vite transform and therefore interprets shader operators as ordinary TypeScript. From the workspace root, run `pnpm shdr check apps/vite-basic/src` for shader-source diagnostics and `pnpm check` for ordinary TypeScript projects. The Shdr CLI does not type-check ordinary code outside shader callbacks. Vite owns the `.shdr.ts` build transform, while the dedicated Shdr editor provider supplies shader diagnostics and hover information in VS Code.

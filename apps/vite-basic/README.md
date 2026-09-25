# Vite/WebGL 2 fixture

This app proves the `@shdr/vite` pre-transform from a `.shdr.ts` module to a rendered WebGL 2 fragment shader.

```sh
pnpm --filter vite-basic dev
pnpm --filter vite-basic build
pnpm --filter vite-basic test:dev
pnpm --filter vite-basic test:render
```

The production build runs `verify-build.mjs`, which confirms that the bundle contains generated GLSL and no original shader DSL source. `test:dev` starts a real Vite development server, requests the transformed shader module, temporarily edits the shader, reloads it in Chromium, and restores the source. `test:render` reads representative canvas pixels in Chromium to verify the gradient, opaque alpha, and top-left-origin Y semantics.

## TypeScript limitation

Do not run standalone `tsc --noEmit` over this fixture. TypeScript does not receive the Vite transform and therefore interprets shader operators as ordinary TypeScript. From the workspace root, run `pnpm shdr check apps/vite-basic/src` for shader-source diagnostics and `pnpm check` for ordinary TypeScript projects. The Shdr CLI does not type-check ordinary code outside shader callbacks. Vite owns the `.shdr.ts` build transform, while the dedicated Shdr editor provider supplies shader diagnostics and hover information in VS Code.

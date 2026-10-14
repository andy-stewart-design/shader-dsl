# Step 3.3 evidence

Date: 2026-10-14

## Documentation and editor verification

- Updated the root language guide and `packages/shdr`, `packages/runtime`, and `packages/vite` guides for `u.texture2D`, `sample`, URL ownership, target bindings, fixed filtering/addressing, top-left orientation, alpha, candidate failure preservation, and deferred resource scope.
- Added `apps/editor-fixture/texture.shdr.ts` with a valid texture declaration and sampling expression.
- Extended the real VS Code test to verify a texture hover, source-located invalid URL diagnostics, source-located invalid sample diagnostics, ordinary TypeScript isolation, and no generated-helper cascades.
- `pnpm --filter @shdr/editor-fixture check` passed.
- `pnpm --filter @shdr/editor-fixture build` passed.
- `pnpm --filter @shdr/editor-fixture test` passed.
- `pnpm --filter @shdr/editor-fixture test:editor` passed in the installed VS Code Extension Development Host.

## Broad regression and remaining gate status

- `pnpm check` passed.
- `pnpm test` passed, including core (430 tests), runtime WebGL/WebGPU texture suites, Vite browser suites, and the REPL browser suite.
- `pnpm ci:check` passed, including the Shdr CLI check of 32 authored shader files.
- Prettier check and `git diff --check` passed.
- The final diff audit found no new compiler/parser imports in static browser entries and no unsupported resource-scope widening.

The Step 3.3 audit is complete, but the broad completion and phase-exit gates remain unchecked because the separately owned Step 3.1 Vite public-asset real-browser gate was intentionally reverted with the `vite-basic` example and still needs to be re-established or explicitly left blocked.

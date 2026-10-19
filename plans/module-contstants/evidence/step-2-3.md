# Step 2.3 evidence

Date: 2026-10-19

## Browser/runtime acceptance

- `pnpm --filter @shdr/runtime check` passed.
- `pnpm --filter @shdr/runtime test` passed. The existing Chromium harness now compiles an imported helper whose defining file owns `const SCALE = 0.5`, installs the artifact in both renderers, and checks `[128, 0, 0, 255]` on WebGL and presented WebGPU.
- The same runtime suite continued to pass its existing uniform, texture, failure-preservation, context-loss, and presented-WebGPU cases.
- `apps/vite-basic/src/shared/gradient-helper.shdr.ts` now exercises a private imported-helper constant (`COLOR_BIAS = 0`); `pnpm --filter vite-basic test` passed production/static, HMR, rendered WebGL/presented-WebGPU, and texture checks.

## REPL acceptance

- `pnpm --filter repl check` and `pnpm --filter repl test` passed.
- The browser REPL verifies a local scalar constant, a `vec2` constant, an alias, and a same-file helper capture. The pinned rendered color is approximately `[32, 128, 64, 255]` on both WebGL and presented WebGPU, with parity sampled at non-square/top-left coordinates.
- An unresolved external constant import reports the source diagnostic (`SHDR1108`/`SHDR1300` depending on validation ordering), performs no source fetch, and preserves the successful frame. Unsupported initializer arithmetic reports `SHDR1105` and also preserves both previews.
- Existing REPL custom-uniform, math, automatic-uniform, texture/resource, and fallback cases remained green.

## Workspace gate

- `pnpm build`, `pnpm check`, `pnpm test`, and `pnpm ci:check` passed. The full test gate included 59 core files/531 tests, 20 language-service files/113 tests, CLI/Vite/project suites, runtime rendered WebGL/presented-WebGPU suites, the REPL, and the Vite fixture.
- Prettier checks and `git diff --check` passed.

## Documentation and scope

- Updated `README.md`, `packages/shdr/README.md`, and `plans/language-exntesion.md` with the delivered grammar and exclusions.
- Updated `plans/module-contstants/spec.md` from planning status to implemented evidence and checked Step 2.3/Phase 2 gates in `plan.md`.
- No runtime named constant export, uniform binding, artifact field, compiler bundle, authored-module execution, or cross-file constant import was added.

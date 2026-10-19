# Phase 0 evidence

## Step 0.1 — Baseline and prerequisites

- **Recorded:** 2026-10-17T17:57:17Z
- **Worktree:** branch `language/square-matrices`; clean at baseline. No pre-existing changed files were present.
- **Toolchain:** Node `v24.21.0`, pnpm `11.23.0`, Turbo `2.10.12`; workspace builds use TypeScript `7.0.2` and tsdown `0.22.14`.
- **Dependency build:** `pnpm exec turbo run build --filter=@shdr/cli --filter=@shdr/language-service --filter=@shdr/vite --filter=@shdr/runtime` passed (7 tasks; Turbo cache hits).
- **Checks:** `pnpm --filter shdr check`, `pnpm --filter @shdr/core check`, and `pnpm --filter @shdr/language-service check` passed.
- **Core characterization:** 4 files, 81 tests passed: vector arithmetic, math-builtin parity, reusable graph, and grouping/render parity.
- **TypeScript 7 characterization:** 3 files, 40 tests passed: constructor parity, arithmetic parity, and reusable-local editor.
- **Browser:** Playwright `1.63.0`, Chrome for Testing `153.0.8010.12`. On the existing secure `http://localhost/` harness with the prescribed SwiftShader flags, WebGL 2 was available using SwiftShader and WebGPU adapter acquisition was available. Existing WebGL/presented-WebGPU characterization tests passed.

No material baseline failure was found. This establishes the baseline only; matrix behavior and raw constructor/operator feasibility remain unverified and belong to Step 0.2.

## Step 0.2 — Raw target feasibility

- **Probe:** `packages/core/test/square-matrix-target-feasibility.test.ts`.
- **Coverage:** 12 constructor families (diagonal, explicit coefficients, complete columns, and copy) across Mat2/Mat3/Mat4; 21 binary families across all three sizes; constant and helper-parameter/dynamic inputs.
- **Result:** 3 tests passed. All 12 constructor cases and all 21 binary cases compiled on real GLSL ES 3.00 and WGSL targets. The asymmetric 2x2 direction and noncommuting composition samples matched the independent expected pixel encodings on WebGL and presented WebGPU.
- **Selected strategy:** GLSL accepts `matN(s)` for diagonal construction. WGSL rejects a scalar-only matrix constructor, so the portable lowering must normalize a diagonal scalar to typed column vectors with the scalar supplied once to a helper/temporary; explicit coefficients, complete columns, and same-size copies compile directly on both targets.
- **Verification:** `pnpm --filter @shdr/core check` passed; the focused feasibility suite passed after formatting. The required SwiftShader WebGL 2/WebGPU browser capabilities were available.

G0 is therefore verified. This is raw-target feasibility evidence only; no Shdr matrix implementation has been added.

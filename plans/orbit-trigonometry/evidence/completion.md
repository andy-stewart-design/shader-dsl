# Phase 3.2 completion evidence

## Result

Phase 3.2 is **Verified** at revision `7b3b014` (branch `language/orbit-trig`). The governing spec, public README, package README, and language-extension roadmap now describe the delivered contract: six direct builtin names, 31 concrete scalar/Vec2/Vec3/Vec4 signatures, native binary `atan` forwarding, floor-based `mod`, `SHDR1209` local domain diagnostics, and dynamic caller preconditions. The orbiting-circles reference remains explicitly outside the delivery because it also requires matrices and a defined replacement for reversed-edge `smoothstep`.

No acceptance gate was waived. Chromium was available with SwiftShader WebGL 2 and presented WebGPU; the required rendered evidence remains in [rendered-parity.md](rendered-parity.md), not replaced by this broad audit.

## Broad verification

All required Phase 3.2 commands passed:

- `pnpm build` — 11 Turbo build tasks passed; Vite and REPL bundle-isolation checks passed.
- `pnpm check` — 17 check tasks passed.
- `pnpm ci:check` — check passed and the built CLI checked 34 shader files with no diagnostics.
- `pnpm test` — 17 test tasks passed: core 51 files / 489 tests, language service 17 / 98, CLI 2 / 26, LSP 3 / 17, plus runtime, Vite, REPL, and editor-fixture browser suites. The orbit verifier passed with WebGL and presented WebGPU parity.
- `pnpm exec prettier --check "**/*.{ts,tsx,md}"` — all files passed.
- `git diff --check` — passed.

The build emitted only the existing TypeScript 7 experimental-API warnings and the existing REPL chunk-size warning; neither is a feature regression or an acceptance deviation.

## Acceptance reconciliation

- **AC1–AC3:** Phase 1 and Phase 2 evidence establish the exact 31-shape public/core/generated matrix, concrete TypeScript 7 hovers, helper coverage, rejected shape/arity forms, source ranges, endpoint handling, partial-known lanes, and `SHDR1209` domain diagnostics.
- **AC4:** Phase 0/Phase 1 evidence and the rendered verifier cover signed floor-based `mod`, vector/scalar divisor broadcasting, non-uniform lanes, exact multiples, and known zero-divisor rejection.
- **AC5:** [atan-comparison.md](atan-comparison.md) records the native-versus-guarded comparison and the selected native contract; Step 1.3 conformance tests preserve `(y, x)` and map GLSL `atan(y, x)` to WGSL `atan2(y, x)`.
- **AC6:** [rendered-parity.md](rendered-parity.md) records independent host references, WebGL readback, presented WebGPU screenshots, dynamic uniform updates, and the explicit 8-channel-value tolerance. Degenerate origin/signed-zero-sensitive cases are not claimed portable.
- **AC7:** Core/editor evidence covers local known non-finite/domain failures, unknown helper parameters as caller preconditions, and both target compilation without WGSL-only eager-constant rejection.
- **AC8:** [phase-2.md](phase-2.md) covers editor/CLI/Vite/REPL parity, invalid-edit previous-frame retention, recovery, and static artifact/compiler isolation.
- **AC9:** The broad build/test audit confirms existing metadata, bindings, grouping, names, old forms, bundle boundaries, runtime updates, and documentation remain compatible. No reference-port fidelity or cross-hardware identity claim was added.

## Remaining scope

`tan`, `%`, matrices, general broadcasting, additional aliases/shapes, interprocedural domain proofs, invalid-runtime fallback pixels, broad hardware precision guarantees, and full reference-shader fidelity remain deferred as specified. No publication or deployment is authorized by this evidence.

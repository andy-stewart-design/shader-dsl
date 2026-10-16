# Phase 1 evidence

## Step 1.1 — Unary inverse trig and angle conversions

- **Status:** Verified for the public/core/generated scope.
- **Implementation:** Added concrete scalar/Vec2/Vec3/Vec4 overloads and runtime markers for `asin`, `acos`, unary `atan`, `radians`, and `degrees`; registered all five names in core; added f32-rounded `asin`/`acos` domain checks; preserved unknown constant lanes and helper parameters; emitted native GLSL/WGSL spellings.
- **Coverage:** 20 unary signatures across public types, target-neutral IR, generated GLSL/WGSL, and real target compiler probes. Invalid arity/shape/domain calls retain original-call diagnostics. Valid rounded endpoints, partial-known vectors, known non-finite compounds, and dynamic helper parameters are covered.

### Verification

All required Step 1.1 commands passed:

- `pnpm build` — 11/11 Turbo tasks successful.
- `pnpm --filter shdr check` and `pnpm --filter shdr test` — passed; 12 tests passed.
- `pnpm --filter @shdr/core check` — passed, including test tsconfig.
- `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-math.test.ts test/orbit-generated.test.ts test/pr3-parity.test.ts test/readable-grouping.test.ts test/reusable-local.test.ts` — 5 files, 133 tests passed.
- Phase 0 exit rerun: `orbit-target-feasibility`, `orbit-atan-comparison`, and the focused baseline core suites — 6 files, 78 tests passed; core check passed.

No editor, CLI, Vite, or presented-pixel acceptance is claimed by this step. Those remain owned by later phases.

## Step 1.2 — Floor-based `mod` and divisor broadcasting

- **Status:** Verified for the public/core/generated scope.
- **Implementation:** Added the seven concrete `mod` forms (S/S, V/V, and V/S), scalar-divisor broadcast at the target call boundary, f32-rounded known-zero divisor diagnostics, and floor-based internal helpers for GLSL and WGSL. Scalar divisors remain scalar in the target-neutral IR; helper requirements are collected from entry statements and reusable helper bodies.
- **Coverage:** Public type assertions and runtime-marker tests cover accepted and rejected forms. Core tests cover all seven signatures, mismatched shapes, known `0`/`-0` divisors, zero lanes beside unknown lanes, known non-finite divisors, helper calls, and generated GLSL/WGSL compilation. Generated helper bodies use `x - y * floor(x / y)` and emit each required helper once per shape.

### Verification

- `pnpm build` — 11/11 Turbo tasks successful.
- `pnpm --filter shdr check` and `pnpm --filter shdr test` — passed; 13 tests passed.
- `pnpm --filter @shdr/core check` — passed, including test tsconfig.
- Focused Step 1.2 suite — 6 files, 99 tests passed.
- Full core suite — 51 files, 481 tests passed.

The target gate used Chromium with WebGL 2 and WebGPU enabled through the existing SwiftShader flags. This verifies generated shader-module/compiler acceptance, not presented-pixel parity. Binary `atan` and later editor/CLI/Vite/pixel gates remain pending.

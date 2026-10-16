# Phase 0 evidence

## Step 0.1 — Baseline

- **Status:** Verified for the baseline scope.
- **Revision:** `1f1a4d6e7c3e7aeba22d585ef7ca2023a059d407` on branch `language/orbit-trig`.
- **Worktree:** Before execution, the only change was the user-owned untracked `plans/orbit-trigonometry/` directory. No unrelated files were changed.
- **Environment:** Node `v24.21.0`; pnpm `11.23.0`; TypeScript `7.0.2` (workspace manifest); Turbo `2.10.12`; Vitest `4.1.11`; Playwright-managed Chromium `153.0.8010.12`.
- **Dependencies:** Existing installed workspace dependencies were used. No dependency installation or browser installation was performed.

### Commands and results

All commands passed:

- `pnpm build` — existing workspace build passed; 11/11 Turbo tasks successful.
- `pnpm --filter shdr check` — passed.
- `pnpm --filter @shdr/core check` — passed, including the test tsconfig.
- `pnpm --filter @shdr/language-service check` — passed.
- `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/pr3-parity.test.ts test/pr3-target-feasibility.test.ts test/mixed-shape-clamp-pow.test.ts test/mixed-shape-clamp-pow-generated.test.ts` — 4 files, 73 tests passed.
- `pnpm --filter @shdr/language-service exec vitest run --config ../../vitest.config.ts --root . test/pr3-editor.test.ts test/mixed-shape-editor.test.ts` — 2 files, 7 tests passed.
- `pnpm --filter repl test:webgpu-feasibility` — generated WGSL rendered and read back successfully for all 3 existing feasibility shaders; WebGPU format was `bgra8unorm`.

The focused core tests exercise compiler source imports while consuming the built `shdr` package boundary. The package checks are source/type checks; the workspace build was run before the consumer-facing tests.

### Browser capability classification

Chromium was launched with `--enable-webgl`, `--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, and `--use-angle=swiftshader`.

- WebGL 2: **Available**, using software rendering: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`.
- WebGPU: **Available**, with a SwiftShader adapter (`vendor: google`, `architecture: swiftshader`), preferred canvas format `bgra8unorm`.
- These observations establish the configured Chromium/SwiftShader path only, not hardware-GPU-wide parity or performance.

### Baseline failures and limitations

No baseline command failed. The baseline does not establish orbit/trigonometry behavior: no new builtin implementation or orbit-specific probe was run. Target observations are software-rendered Chromium observations and remain subject to the Phase 0 raw-target and binary-`atan` decision gates.

## Step 0.2 — Raw-target feasibility and constant evaluation

- **Status:** Verified for the tested Chromium/SwiftShader target path.
- **Test:** `packages/core/test/orbit-target-feasibility.test.ts`.
- **Verification:** `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-target-feasibility.test.ts` — 4 tests passed.
- **Coverage:** All 31 agreed shapes compiled as raw GLSL ES 3.00 and WGSL. Unary `asin`, `acos`, `atan`, `radians`, and `degrees` used native spellings; binary `atan` used GLSL `atan(y, x)` and WGSL `atan2(y, x)`. The seven `mod` shapes used explicit floor-based lowering, including an explicit vector splat for vector/scalar calls.

### Findings

- GLSL native `mod(S,S)`, same-shape vector forms, and `mod(Vn,S)` all compiled in this implementation. `mod(S,V2)` was rejected with no matching overload. This is a target observation, not a reason to widen Shdr's boundary.
- Signed and non-uniform ordinary results agreed with `x - y * floor(x / y)` on both targets. WebGL readback was 8-bit encoded and observed approximately `[0.49, -0.49, -0.49, 0.02]` for `[0.5, -0.5, -0.5, 0]`, `[0.49, -0.49, 1.51, -1.51]` for `[0.5, -0.5, 1.5, -1.5]`, and `[-1.51, -0.49, -0.49, -1.51]` for the scalar-divisor vector case. WGSL float readback was `[0.5, -0.5, -0.5, 0, 0.5, -0.5, 1.5, -1.5, -1.5, -0.5, -0.5, -1.5]`.
- The tested small-divisor and extreme-intermediate WGSL observations were `floor_mod(1.234567, 1e-6) = 0`, `floor_mod(1.234567, 1e-20) = 0`, `floor_mod(3.1415927, 1e-3) ≈ 0.0005927086`, and `floor_mod(3e38, 7) = 0` on this path. They establish no precision/range guarantee; the implementation must retain conservative ordinary-finite limits rather than promise all finite intermediates.
- All four `asin`/`acos` f32 endpoints, the negative horizontal binary-`atan` axis probe, and angle conversions compiled on both targets. Unknown dynamic direct and helper inputs compiled without target diagnostics. WGSL rejected direct `asin(1.1)`, `acos(-1.1)`, and the overflowing `asin(2e38 + 2e38)` compound; GLSL accepted those raw source forms. WGSL also rejected those constant arguments when passed through the tested helper, while unknown helper input remained accepted. This supports authored source diagnostics for locally provable invalid constants and does not support relying on target acceptance.
- No raw-target blocker was found for the agreed ordinary finite shapes. The binary `atan` axis/domain contract remains unresolved and is still owned by Step 0.3.

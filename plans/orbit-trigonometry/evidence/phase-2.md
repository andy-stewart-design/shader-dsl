# Phase 2 evidence

## Step 2.1 — TypeScript 7/editor and CLI parity

- **Status:** Verified for the editor and CLI scope.
- **Implementation:** Added `packages/language-service/test/orbit-editor.test.ts` covering all 31 concrete signatures, concrete QuickInfo result types, local/imported binary-`atan` helpers, authored-range diagnostics, f32-rounded endpoints, domain failures, valid-invalid-valid edits, and ordinary TypeScript diagnostic ownership. Extended the CLI integration suite with a valid fragment/imported-helper graph covering all 31 forms plus invalid mixed-shape and non-finite binary-`atan` calls.
- **Compatibility:** Updated the pre-existing unsupported-import ownership test to use an unrelated unsupported name now that `atan` is an accepted builtin.

### Verification

- `pnpm --filter @shdr/language-service check` — passed.
- Focused editor suite — 4 files, 50 tests passed.
- Full language-service suite — 17 files, 98 tests passed.
- `pnpm --filter @shdr/cli check` — passed.
- `pnpm --filter @shdr/cli build` — passed.
- Full CLI suite — 2 files, 26 tests passed.

Diagnostics remained mapped to original authored calls without generated-helper cascades; valid/invalid helper edits refreshed correctly. This step does not claim static Vite, REPL, or rendered-pixel acceptance; those remain Steps 2.2 and 3.1.

## Step 2.2 — Static Vite and browser/REPL paths

- **Status:** Verified for static and browser/compiler integration.
- **Implementation:** Added `apps/vite-basic/src/orbit-math.shdr.ts` with observable inverse trig, unary/binary `atan`, conversions, and signed floor-based `mod`. The artifact is rendered in the dual-backend Vite fixture and used by the WebGL-only consumer. Production/source-map checks assert orbit shader inclusion, `atan2`, modulo helpers, and compiler/runtime bundle isolation.
- **Browser coverage:** Vite development verification checks the transformed orbit artifact and WebGL rendering. The rendered fixture checks WebGL and presented WebGPU orbit output. REPL verification compiles an in-text helper using binary `atan`, validates both previews, rejects an invalid mixed-shape edit with original diagnostics, confirms both previous frames remain, and verifies recovery.

### Verification

- `pnpm --filter vite-basic check` — passed.
- `pnpm --filter vite-basic build` — passed, including static bundle-boundary checks.
- `pnpm --filter vite-basic test` — passed: build, dev/HMR, render, and texture verifiers.
- `pnpm --filter repl check` — passed.
- `pnpm --filter repl build` — passed, including compiler-exclusion verification.
- `pnpm --filter repl test` — passed: WebGL/WebGPU validation, invalid-edit retention, and recovery.
- Phase 2 exit suites also passed: language service 17 files / 98 tests and CLI 2 files / 26 tests.

The browser runs used Chromium with SwiftShader WebGL and enabled WebGPU. This verified static/compiler/runtime integration and edit recovery; numerical rendered-parity acceptance was completed in Phase 3.1.

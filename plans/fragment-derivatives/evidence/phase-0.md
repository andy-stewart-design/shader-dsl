# Phase 0 evidence

## Step 0.1 — Baseline

**Status: Complete for the checked baseline; editor/target prerequisites are gaps.** Recorded at `8f2beb5beed7f3d5c3da2c6e6e24fcb4aa4d2a42` (`main`, 2026-04-13). At start, `git status --short --branch` showed `main...origin/main` plus the pre-existing untracked `plans/fragment-derivatives/` planning files. Do not attribute those planning files to this execution.

Environment: Node `v24.21.0`; pnpm `11.23.0`; TypeScript `7.0.2`; Vitest `4.1.11`; Playwright dependency `1.63.0`; `code --version` reports VS Code `1.138.0` (Electron `37.4.0`, arm64). The default executable expected by the editor fixture (`/Applications/Visual Studio Code.app/Contents/MacOS/Electron`) is absent; no `VSCODE_EXECUTABLE_PATH` was set. Playwright browser cache directories exist, and the feasibility test successfully launched Chromium far enough to compile/link/draw WebGL; no standalone system `chromium` executable was found.

Commands/results:

| Command | Result |
| --- | --- |
| `pnpm build` | Pass (11 tasks). Existing Vite/REPL bundle-size warnings only. |
| `pnpm --filter shdr check` | Pass |
| `pnpm --filter @shdr/core check` | Pass |
| `pnpm --filter @shdr/language-service check` | Pass |
| `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-graph.test.ts test/orbit-generated.test.ts` | Pass, 2 files / 16 tests |

Existing contract confirmed by source/spec inspection: GLSL constructs top-left `coord.y` as `u_resolution.y - gl_FragCoord.y`; WGSL uses fragment position with top-left Y; fragment/helper syntax is straight-line and helpers are statically lowered in defining files. Derivatives are not exposed/implemented. This is source inspection, not derivative runtime evidence.

## Step 0.2 — Raw target feasibility

**Status: Complete for raw-target feasibility.** The initial `WebGPU adapter unavailable` failure came from `page.setContent`, which leaves an opaque `about:blank` origin; WebGPU requires a secure context. The probe now navigates to a fulfilled `http://localhost/` page. A subsequent all-zero readback exposed a second probe bug: the 96-pixel RGBA row used a 256-byte stride, smaller than the 384-byte row. Corrected it to a 512-byte aligned stride, sized the buffer to `512 * 64`, used the matching sample offset, and added a validation error scope around GPU commands. No Shdr compiler or accepted authored call is involved.

Raw pixel encoding is `0.5 + 0.25 * slope`; a unit slope encodes to about 191/255, a negative unit slope to 64/255, and a 2x width lane to 255/255. Both target checks use +/-4 byte codes (8-bit quantization plus observed SwiftShader accuracy); this is a raw-probe tolerance, not yet the generated-feature gate. GLSL applies explicit result-side `-dFdy(...)` for top-left signed Y. WGSL module compilation and pipeline creation pass, and its offscreen draw/readback passes signed X/Y, reconstructed negative Y, fwidth, and vector-lane checks. Scalar/vector helper and signature cases are in the raw sources.

Both probe issues were test-harness setup errors (insecure origin and undersized copy row), not evidence of broken WGSL derivatives. Playwright Chromium ran with `--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, and `--use-angle=swiftshader`; browser/WebGPU adapter details are collected in the passing test result. The editor fixture's configured VS Code executable is missing, so real-editor verification remains unavailable. No package prerequisite was installed or altered.

## Gate

Baseline build/type/graph checks pass at the recorded revision. The focused raw probe now passes on both targets; WGSL validation and rendered evidence are distinct in the test, and the readback copy is guarded by a validation error scope. The Phase 0 exit rerun passed: probe plus `test/reusable-graph.test.ts` (2 files / 16 tests), and `pnpm --filter @shdr/core check`. Phase 0 target-feasibility gate is complete. This does not claim generated-feature acceptance or real-editor readiness.

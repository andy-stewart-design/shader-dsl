# Phase 0 evidence

## Step 0.1 — Baseline

**Status: Complete for the checked baseline; editor/target prerequisites are gaps.** Recorded at `8f2beb5beed7f3d5c3da2c6e6e24fcb4aa4d2a42` (`main`, 2026-04-13). At start, `git status --short --branch` showed `main...origin/main` plus the pre-existing untracked `plans/fragment-derivatives/` planning files. Do not attribute those planning files to this execution.

Environment: Node `v24.21.0`; pnpm `11.23.0`; TypeScript `7.0.2`; Vitest `4.1.11`; Playwright dependency `1.63.0`; `code --version` reports VS Code `1.138.0` (Electron `37.4.0`, arm64). The default executable expected by the editor fixture (`/Applications/Visual Studio Code.app/Contents/MacOS/Electron`) is absent; no `VSCODE_EXECUTABLE_PATH` was set. Playwright browser cache directories exist, and the feasibility test successfully launched Chromium far enough to compile/link/draw WebGL; no standalone system `chromium` executable was found.

Commands/results:

| Command                                                                                                                                      | Result                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm build`                                                                                                                                 | Pass (11 tasks). Existing Vite/REPL bundle-size warnings only. |
| `pnpm --filter shdr check`                                                                                                                   | Pass                                                           |
| `pnpm --filter @shdr/core check`                                                                                                             | Pass                                                           |
| `pnpm --filter @shdr/language-service check`                                                                                                 | Pass                                                           |
| `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-graph.test.ts test/orbit-generated.test.ts` | Pass, 2 files / 16 tests                                       |

Existing contract confirmed by source/spec inspection: GLSL constructs top-left `coord.y` as `u_resolution.y - gl_FragCoord.y`; WGSL uses fragment position with top-left Y; fragment/helper syntax is straight-line and helpers are statically lowered in defining files. Derivatives are not exposed/implemented. This is source inspection, not derivative runtime evidence.

## Step 0.2 — Raw target feasibility

**Status: Complete for raw-target feasibility.** The initial `WebGPU adapter unavailable` failure came from `page.setContent`, which leaves an opaque `about:blank` origin; WebGPU requires a secure context. The probe now navigates to a fulfilled `http://localhost/` page. A subsequent all-zero readback exposed a second probe bug: the 96-pixel RGBA row used a 256-byte stride, smaller than the 384-byte row. Corrected it to a 512-byte aligned stride, sized the buffer to `512 * 64`, used the matching sample offset, and added a validation error scope around GPU commands. No Shdr compiler or accepted authored call is involved.

The raw probe was strengthened after review: no derivative/vector expression is multiplied by zero or a tiny epsilon, and no checked lane saturates. Sign channels use `0.5 + 0.25 * slope`: `dFdx(x) ≈ +1` and top-left downward `dFdy(y) ≈ +1` encode near 191/255; reconstructed-up Y `≈ -1` encodes near 64/255. The alpha channel uses `0.25 + 0.1 * width` for four distinct vector lanes with widths `[0.5, 1, 1.5, 2]`, expected bytes `[77, 89, 102, 115]`. A second interior row makes every scalar/Vec2/Vec3/Vec4 signature observable through reachable typed helpers, combining signatures into expected bytes `[102, 102, 153, 191]`. Both targets pass with a declared +/-4 byte-code tolerance (8-bit quantization and observed SwiftShader accuracy); this raw-probe tolerance is not the final generated-feature gate. GLSL applies the negative sign to native `dFdy` results; WGSL uses native `dpdy`.

Both original WebGPU failures were test-harness setup errors (insecure origin and undersized copy row), not evidence of broken WGSL derivatives. Playwright Chromium ran with `--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, and `--use-angle=swiftshader`; the probe creates a WebGL 2 context, requests a WebGPU adapter, compiles/links GLSL, validates WGSL module and render pipeline, renders both targets to 96x64 attachments, and checks interior readback pixels. The configured VS Code executable remains missing; real-editor verification is not a Phase 0 target gate. No package prerequisite was installed or altered.

## Gate

Baseline build/type/graph checks pass at the recorded starting revision. After the raw-probe corrections, the Phase 0 exit rerun passed: `test/fragment-derivatives-target-feasibility.test.ts` plus `test/reusable-graph.test.ts` (both are included in the later 7-file / 102-test focused run), `pnpm --filter @shdr/core check`, `pnpm --filter shdr check`, and `git diff --check`. WGSL copy validation is guarded by an error scope. Phase 0 raw-target feasibility is verified; this does not claim Phase 3 presented-canvas acceptance or real-editor readiness.

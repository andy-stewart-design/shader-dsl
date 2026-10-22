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

**Status: Blocked.** Added `packages/core/test/fragment-derivatives-target-feasibility.test.ts`, a raw GLSL ES 3.00/WebGL 2 and WGSL probe. It compiles and links a GLSL fragment shader using derivatives in a reachable helper, draws a 96×64 fullscreen triangle, and attempts WebGPU WGSL module/pipeline validation. No Shdr compiler or accepted authored call is involved. The focused run fails with `WebGPU adapter unavailable` after the WebGL work, because `navigator.gpu.requestAdapter()` returns null under the installed Playwright Chromium/SwiftShader launch. The target test intentionally fails rather than skip when WebGPU is absent. Thus no WGSL shader/pipeline/pixel claim is made, and Phase 0 cannot exit.

Planned rendered encoding is `0.5 + 0.25 * slope`, with an expected unit slope encoded as 191/255 and a provisional +/-4 byte-code window (8-bit quantization plus target noise). This is only a probe tolerance proposal; it is not approved as a generated-feature gate until both target observations exist. GLSL uses explicit result-side `-dFdy(...)` for top-left signed Y. The WGSL source includes scalar and vector helper signatures and derivative uses; its compilation/pipeline status remains unverified because adapter acquisition fails first.

The browser/editor capability gap is real: this run found no WebGPU adapter, and the editor fixture's configured VS Code executable is missing. The existence of installed VS Code CLI/cache directories is not evidence that the fixture can launch an editor or that WebGPU works. No package prerequisite was installed or altered.

## Gate

Baseline build/type/graph checks pass at the recorded revision. The raw target feasibility test does not pass: WebGL compile/link/draw was reached, but WGSL and cross-target rendered semantics were not evidenced. Phase 0 is **Blocked**, and Phase 1 must not begin until WebGPU is available or the owner reviews a spec change. Rerun the focused probe and core check after resolving the target prerequisite. No derivative feature behavior, editor readiness, or acceptance criteria are claimed.

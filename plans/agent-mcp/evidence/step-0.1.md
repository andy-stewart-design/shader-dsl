# Step 0.1 — Baseline and access evidence

Inspection/check date: 2026-11-09 (local run; see raw logs timestamps). Repository revision `7180790171f0c7fe876c25cf1505a34dcac5f0fe`, branch `repl/agent-mcp`. Node `v24.21.0`; pnpm `12.6.0` (`pnpm@12.6.0` from the root manifest). Initial and final `git status --short` were clean; checks produced only ignored build output (`dist/`, `apps/repl-web/.output/`, Turbo cache). No tracked or untracked feature files changed before this note.

## Safe command review

The root scripts were inspected before execution. `build` is `turbo run build`; `check` is `turbo run check`; `repl-web` has only `vite build`, `tsc --noEmit`, and `eslint .`. The runtime package's `pretest` is `playwright install chromium`, so the package lifecycle test was not run. The approved focused Vitest command invokes Vitest directly and does not run that lifecycle. No install, browser download, live model call, server, deployment, or destructive command was invoked.

## Existing baseline commands

Commands were run sequentially from repository root to avoid shared Turbo/dist contention. Results are actual command results, not acceptance claims:

| Command | Exit | Result / relevant diagnostics |
|---|---:|---|
| `pnpm build` | 0 | 13 Turbo tasks successful, 6 cached. Warnings: TypeScript 7 experimental API; Vite/Rolldown module-level `use client` warnings; chunk-size warnings; Turbo warns no output files for `repl-web#build`. |
| `pnpm check` | 0 | 19 tasks successful (19 cached). Type checks completed; same TypeScript 7 experimental-API build warnings appeared in dependency builds. |
| `pnpm --filter repl-web check` | 0 | `tsc --noEmit` completed without diagnostics. |
| `pnpm --filter repl-web lint` | 0 | `eslint .` completed without diagnostics. |
| `pnpm --filter repl-web build` | 0 | Vite/Nitro build completed. Existing module-level `use client` warnings from Base UI/Rolldown and a chunk-size warning were emitted; no build failure. |
| `pnpm --filter @shdr/runtime exec vitest run test/scheduler.test.ts --config ../../vitest.config.ts` | 0 | 1 file, 7 tests passed in 83 ms. This direct command avoided the runtime `pretest` Chromium-install hook. |

Raw logs (including command output and exit marker):

- `/tmp/shader-dsl-step-0.1-pnpm-build.log`
- `/tmp/shader-dsl-step-0.1-pnpm-check.log`
- `/tmp/shader-dsl-step-0.1-repl-web-check.log`
- `/tmp/shader-dsl-step-0.1-repl-web-lint.log`
- `/tmp/shader-dsl-step-0.1-repl-web-build.log`
- `/tmp/shader-dsl-step-0.1-runtime-scheduler.log`

The full runtime lifecycle command `pnpm --filter @shdr/runtime test` was **not run** because its `pretest` downloads Chromium; the existing cache presence was observed but is not approval. No failed approved check was repaired, waived, or reclassified.

## Source seams and test coverage observed

- `apps/repl-web/src/routes/index.tsx` is the app-level composition seam: `useShdrCompilation()` supplies artifact/errors/Apply to `Editor`; `Preview` is mounted only when an artifact exists.
- `src/stores/draft.ts` has independent `main`, `utils`, and `uniforms` state plus independent `setSource`/`setUniforms` actions. There is no revision, atomic multi-field command, or applied identity.
- `src/hooks/use-code-editor.ts` and `src/editor/create-editor.ts` initialize CodeMirror from `initialDoc`; CodeMirror owns subsequent edits, history is enabled in `extensions.ts`, and the exposed handle only has `destroy()`. Store-only source writes would not update a mounted editor.
- Uniform authoring is separate from source: `src/shared/uniforms.ts` stores float string drafts (`value`, `min`, `max`) and color editable/cache fields (`draft`, `valid`); `uniforms-pane/helpers.ts` and `definitions.ts` validate identifiers/reserved names, duplicates, finite f32/ranges, and 3-/6-digit hex colors before compiler definitions are generated.
- `src/hooks/use-shdr-compilation.ts` performs explicit synchronous Apply from `getDraftState()`. Failed compilation leaves the prior artifact in place; successful Apply snapshots uniforms and replaces the artifact. Compile diagnostics are flattened to a string for the editor status, while `compile-shdr-body.ts` retains document/range diagnostics internally. Apply is not awaitable for renderer installation/draw and has no draft/applied revision identity.
- `src/hooks/use-shdr-preview.ts` and `src/preview/create-preview.ts` own asynchronous renderer creation/replacement, stale lifecycle rejection, WebGPU-first/WebGL fallback, runtime reset-to-default behavior after successful replacement, and canvas/renderer handles. `PreviewHandle` exposes the active canvas/backend and async `setShader`/`draw`, but there is no supported snapshot/export operation or revision-correlated capture seam.
- Runtime `Renderer` types expose asynchronous `setShader()` and `draw()`, explicit `superseded` installation results, uniform/runtime controls, and disposal. Existing runtime tests include scheduler behavior but not REPL Apply/capture identity.
- Existing REPL source tests are under `apps/repl-web/src/**/*.test.ts` and use `node:test` (draft, compiler mapping, uniform validation/runtime controls, editor command/history, preview store). `apps/repl-web/package.json` has no test script; the root Vitest include is `test/**/*.test.ts`, so these source tests are not covered by the root command and must not be claimed as executed by this baseline. The focused approved runtime test is the only test command run.
- Static search found no existing MCP/WebSocket bridge, connection provider/UI, agent schema validator, deployment/header configuration, or bridge-specific tests.

## Environment and live/access prerequisites

- Current read-only system metadata: macOS `26.6.2` (build `25G83`), Darwin arm64. `pi --version` reports `1.4.0`; selected non-secret environment metadata identifies provider `openai-codex`, model `gpt-6.1-sol`, and reasoning setting `high`. This identifies the current configuration, not verified MCP image delivery or model image capability.
- No standard Google Chrome/Canary application was found at the checked `/Applications` and user Chrome paths. This does not prove that no compatible browser exists elsewhere or identify a running browser. Existing Playwright cache directories include `chromium-1243`, `chromium_headless_shell-1243`, and `chromium_headless_shell-1217`; cache presence is neither browser execution nor download permission. The installed Playwright manifest names Chromium `153.0.8010.12`; target hardware/browser behavior remains untested.
- No approved HTTPS fixture/REPL target or deployment/header operator was supplied or found. The README documents generic Nitro hosting, not an actual deployment; no effective deployed CSP is known. Repository inspection cannot authorize a target or establish its permissions.
- No manual app/browser walkthrough, Local Network Access/CSP check, canvas export, or live image-to-model check was performed. Browser launch/download, extra model calls, deployment/header changes, and agent configuration changes have not been approved by this baseline request.

These are explicit blockers for the affected hosted/browser/model gates, not baseline-command failures or waivers. The requesting user must supply an approved target and coordinate site/header authority before Step 1.3; model/browser access and required approvals must also be established. No URL, CSP, approval reference, or operator was invented.

## Phase 0 gate assessment

Step 0.1's baseline/access completion gate is satisfied: all six approved commands passed, source seams and coverage gaps are recorded, and unavailable live prerequisites are explicitly identified rather than assumed. This permits later deterministic work to be considered; it is not permission to begin Phase 1, install dependencies, or perform live actions. Step 1.3 and dependent hosted/browser/model gates remain blocked until their access and approvals exist. No feature acceptance, deployment, or release is claimed.

Implementation follow-up: the existing REPL tests use `node:test`, whereas Step 3.1 proposes explicit Vitest coverage. Before that step, confirm a runner arrangement that genuinely executes existing tests; discovery by a Vitest filename pattern alone is not proof. No test-runner or execution-contract change was made in this baseline.

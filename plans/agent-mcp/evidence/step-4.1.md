# Step 4.1 — Apply orchestration

Implemented the app-local awaitable Apply pipeline. `apply_sketch` is advertised only when a real Apply controller is supplied; renderer-unready calls return a structured backend failure; the deployed REPL catalog is the existing three authoring tools plus `apply_sketch` (no separate diagnostics tool). Apply snapshots the expected draft revision and editable uniform-definition strings, compiles, installs through the real preview handle, and resolves only after the renderer `draw()` promise completes. `get_sketch` and `get_authoring_context` expose the latest correlated attempt/diagnostics and last confirmed applied revision; they do not retag an older artifact after a draft edit.

Structured diagnostics preserve `main`/`utils`/`uniforms` ranges where available and categorize uniform, syntax/type, backend, install, draw, stale, cancelled, and superseded failures. Failed compile/replacement leaves the previous applied identity unchanged; cancellation/supersession settles without replay. Manual Run uses the same controller and renderer completion seam, retaining existing runtime-default reset behavior.

Checks:

- `pnpm --filter repl-web test` — **61 passed** (native Node 24 `node:test`, including 5 Apply lifecycle/race tests).
- `pnpm --filter repl-web check` — passed.
- `pnpm --filter repl-web lint` — passed.
- `pnpm --filter repl-web build` — passed; existing bundler `use client` dependency warnings only.
- `pnpm --filter repl-web build:authoring-probe` — passed.

Automated coverage includes compile/no-install and uniform/error identity, delayed install/draw readiness, stale expected revisions, current-draft divergence, superseded completion isolation, cancellation, and no replay. Real renderer wiring uses `useShdrPreview`'s injected app-local port and its actual `setShader`/`draw` promises; no arbitrary timeout or RAF completion is used.

**Manual hosted Apply/diagnostic/draw verification: PENDING user-assisted run** against the approved deployed REPL `https://shdr-repl.vercel.app/`. Phase 4.1 is not represented as a completed live acceptance gate, and Phase 4.2 remains untouched.

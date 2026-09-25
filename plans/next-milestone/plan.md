# Next milestone — checker, practical arithmetic, and editor support

Status: proposed. This follows the [POC outcome](../_completed/poc/outcome.md); it is not a claim that the POC editor implementation is production-ready.

## Goal and boundaries

Make `.shdr.ts` useful for a small but realistic fragment shader: check it in CI, author common arithmetic/vector expressions, and get intelligible editing in VS Code and, preferably, Zed. Preserve native operator syntax, the filesystem-independent core, original-source diagnostic ranges, and one target-neutral IR generating both GLSL ES 3.00 and WGSL.

Ship as **three separately reviewable PRs**, in order: (1) checker CLI, (2) arithmetic/vector language slice, (3) editor highlighting and Zed/LSP feasibility. PR 1 must not depend on PR 2; PR 3 should exercise PR 2's expanded examples. Each PR updates its own documentation and tests. Stop at each PR gate before merging the next. No standalone `tsc` integration, new shader stage, custom resources, general JavaScript execution, or production-ready cross-editor LSP is promised in this milestone.

**Important distinction:** the initial `shdr check` checks Shdr syntax and semantics through `@shdr/core`, including import/callback boundary rules. It does **not** check ordinary TypeScript statements outside the shader callback, resolve TS project references, or replace `tsc` for ordinary `.ts` files. The editor currently has additional TypeScript diagnostics and hover behavior; do not call CLI/editor diagnostics identical until a shared project-checking path actually exists.

## PR 1 — `shdr check` for CI

### Phase 1.1 — Define the command contract

- Add a Node-only CLI package (for example `packages/cli`) that consumes public `@shdr/core` APIs. Keep filesystem traversal, printing, and process exit codes out of core.
- Specify invocation (`shdr check [paths...]`), default recursive `.shdr.ts` discovery from the working directory, deterministic path ordering, handling of explicit files/directories, ignored generated/dependency directories, and the behavior for no matches. Document whether explicit paths override default ignores. Make errors for missing/unreadable paths actionable.
- Specify output: file, 1-based line/column, Shdr code and message, with stable ordering. Exit 0 for clean input, 1 for shader diagnostics, and 2 for usage/discovery/I/O errors. Avoid exposing parser internals, virtual helper names, or generated offsets. Start with a human-readable format; JSON can follow if a real consumer requires it.
- Document how CI combines `shdr check` for shader files with ordinary `tsc` checks for ordinary TypeScript, without claiming full `.shdr.ts` TypeScript checking.

**Verify:** contract tests for help, no matches, explicit paths, ignored paths, invalid arguments, and exit codes. Record the chosen discovery/ignore rules in the CLI README.

**Result — complete (contract only):** `packages/cli` defines the argument/help/exit-code contract and implements deterministic path discovery, with tests for no matches, explicit and ignored paths, deduplication, ordering, invalid input, and symlinks. Its README records the discovery and reporting rules. Build, check, tests, and formatting pass. There is intentionally no executable or shader diagnostic reporting yet; Phase 1.2 connects the contract to `@shdr/core` and installs the command.

### Phase 1.2 — Implement and integrate

- Recursively discover and read files, call `lowerFragment(source)` once per file, convert original UTF-16 source offsets to line/column consistently, aggregate _all_ returned diagnostics, and continue past other invalid files. Do not generate either target just to check source semantics.
- Add fixtures for valid source, bad boundary, unsupported syntax, semantic error, nested operator error, multiple files, and a path containing spaces. Test invocation as a subprocess from outside the package as well as through the workspace script.
- Add a CI usage example and an end-to-end fixture that runs the checker alongside the existing workspace `check` command; guard against accidental `tsc --noEmit` over `.shdr.ts`.

**PR gate:** clean and invalid projects return the specified results; diagnostic positions point into original files; `pnpm build`, `pnpm check`, and `pnpm test` pass. CLI outputs remain unchanged for existing POC examples.

**Result — complete:** `@shdr/cli` declares a `shdr` binary and the root `pnpm shdr` script runs it. It discovers `.shdr.ts` files, calls public `lowerFragment` per file, prints source-ranged diagnostics in stable order, and uses 0/1/2 exit codes. Subprocess fixtures cover valid files (including ordinary TS outside the callback), invalid boundary/syntax/semantics, nested operations, multiple diagnostics/files, spaces, Unicode/CRLF positions, ignored paths, help and usage failures. `pnpm ci:check` combines ordinary workspace checks with default shader discovery; intentionally invalid examples under `test/fixtures` are skipped by default (but explicit paths still check them), and excluded from standalone `tsc`. The complete `pnpm build`, `pnpm ci:check`, and `pnpm test` suite passed, including browser tests. Distribution outside this private workspace is not yet claimed.

## PR 2 — Small arithmetic/vector language slice

### Phase 2.1 — Lock the semantic matrix before coding

- Specify `+`, `-`, `*`, existing `/`, and unary `-` over `F32`, `Vec2<F32>`, `Vec3<F32>`, and `Vec4<F32>`. Proposed starting rule: `+`/`-` accept equal types; `*` and `/` accept scalar/scalar, equal-size vector/vector, and vector/scalar. Do not silently introduce scalar/vector or mixed-dimension operations. Check both GLSL and WGSL support for each proposed rule before freezing the matrix.
- Specify `vec2` and `vec3` constructors narrowly: scalar splat, matching numbers of scalar components, and copy of the same vector type. Retain the existing `vec4` forms; defer mixed-component packing until explicitly specified. Keep the final fragment return `Vec4<F32>`.
- Define read swizzles using `xyzw`: lengths 1–4, any sequence of components available on the receiver (repeats allowed), yielding `F32` or the corresponding vector dimension. No `rgba` aliases, computed access, or writable swizzles yet. Decide and test diagnostics for an unavailable component and unsupported spelling.
- Record operator precedence/associativity and numeric-literal behavior, including `-1`, `a - -b`, and nested/grouped expressions. Freeze the rule/diagnostic table before editing the virtual checker and lowerer.

**Verify:** representative positive/negative source examples and a documented rule matrix reviewed against both targets. If a rule cannot be expressed faithfully in either backend, narrow the matrix rather than adding target-conditioned lowering.

### Phase 2.2 — Extend both type systems together

- Extend `shdr` public `Expr`/constructor types and the private virtual helper overloads; add virtual rewrites and operation metadata for the new operators, including unary minus. Keep ordinary code outside callbacks byte-for-byte intact. Ensure helpers never surface in user diagnostics.
- Extend parsing/validation and normalized syntax, semantic typing and target-neutral IR (a unary node if needed), and both generators. Preserve original-source ranges, precedence and grouping. Update exhaustive visitors and expression emitters when IR grows.
- Add one parity matrix shared in intent across TypeScript 7 virtual checking and core lowering: every accepted combination has the same result type, every rejected one has a mapped, sanitized diagnostic. Include all constructor forms and swizzles, not just happy paths. Test nested invalid operations and literal/unary mapping.

**Verify:** core and language-service unit tests, frozen-IR backend parity/determinism, GLSL WebGL compilation/rendered pixels, WGSL WebGPU shader-module validation where available, Vite dev/build examples, REPL compilation, and the real VS Code hover/diagnostic checklist on the expanded fixture. A new non-gradient shader must exercise the added operators and a `Vec3`/swizzle path through both generators.

### Phase 2.3 — Document the actual accepted subset

- Update the language reference, error examples, and fixture shaders. Make it clear that this remains a restricted shader language with `const` and a final `return`, not arbitrary TypeScript/GLSL/WGSL.
- Run the PR 1 checker on new valid and invalid fixtures; confirm that CLI and compiler diagnostics match for shader semantics. Do not claim parity for ordinary TypeScript outside callbacks.

**PR gate:** the new shader passes CLI checking, editor semantic tests, both target generators, and browser validation; invalid rules fail in both checker paths with original-source ranges; the entire workspace suite passes.

## PR 3 — Highlighting and Zed/LSP feasibility

### Phase 3.1 — Separate visual highlighting from semantic services

- Audit how the dedicated `shdr-typescript` language ID in `apps/editor-fixture` affects highlighting. Add a VS Code grammar contribution that reuses TypeScript lexical scopes where feasible; test `.shdr.ts` language recognition and basic highlighting without disrupting existing Shdr diagnostics/hovers or ordinary `.ts` ownership. Do not write a shader regex grammar that pretends to implement semantic checking.
- Run a **time-boxed Zed spike**: verify file association, whether existing TypeScript tree-sitter grammar/highlight queries can be reused for `.shdr.ts`, and the minimum viable extension packaging. Produce a real screenshot/manual checklist or reproducible test of a highlighted fixture in Zed. Document version(s), installation steps, and any grammar/extension constraints; don't assume VS Code's TextMate grammar works in Zed.

**Verify:** the same expanded fixture is readable and correctly recognized in both editors. Report what works and fails independently for highlighting, diagnostics, and hover.

### Phase 3.2 — Test a shared semantic transport, not a second checker

- Spike a small, editor-independent LSP process that wraps `@shdr/language-service` and handles document open/change/close, publishDiagnostics, and hover for `.shdr.ts`. Verify original-source ranges, stale-version rejection, shutdown, and behavior when parsing fails. Keep protocol/process code outside `@shdr/core`; do not implement a second semantic engine in a Zed extension.
- Determine how Zed launches that process and whether Zed can assign `.shdr.ts` its own language without also surfacing native TypeScript arithmetic errors. Test one mapped invalid-operation diagnostic and one `Expr<Vec2<F32>>` hover in an actual Zed session if the extension API permits. If not, record the exact blocker and a viable alternative rather than publishing duplicate/conflicting diagnostics.
- Assess the current synchronous TypeScript 7 adapter, one-root/one-tsconfig assumption, cancellation, workspace configuration and distribution requirements. A worker/process boundary and multi-root/project references are **follow-up implementation**, unless strictly necessary to make the spike honest. Pin tested TypeScript/editor versions and add repeatable protocol tests around the unstable API.

**Verify:** protocol-level automated tests and a short editor matrix: VS Code/Zed file recognition, highlighting, diagnostics, hover, and observed conflicts with native TypeScript. Do not silently replace the working VS Code provider during this experiment.

### Phase 3.3 — Decide the integration path

- Write a short decision record: extend the shared LSP for both editors, keep a VS Code-specific adapter plus Zed LSP, or defer Zed semantics with evidence. Note what would be required to package, install, update, and test the chosen approach.
- If Zed highlighting or basic semantics is blocked, explicitly mark the milestone's Zed goal **not met**; do not describe the time-boxed spike as shipped Zed support. Keep the VS Code highlighting improvement separately mergeable.

**PR gate:** VS Code highlighting works without regressing existing provider tests; Zed highlighting is demonstrated **or** a concrete blocker is documented; LSP/Zed diagnostic-and-hover feasibility has a tested result and an explicit next decision. Full production LSP, semantic tokens, completion, rename, and multi-project support are not required to merge this PR.

## Whole-milestone acceptance

1. A nontrivial fragment shader uses the new arithmetic, `Vec3`, and swizzles; `shdr check` reports success in CI.
2. The same source lowers once to target-neutral IR, generates both targets, renders through GLSL/WebGL, and compile-validates through WGSL/WebGPU where available; invalid expressions produce mapped, sanitized diagnostics.
3. VS Code has usable highlighting as well as the existing hover/diagnostic behavior. Zed's recognition/highlighting and semantic integration have independently recorded results; only claim a pleasant Zed experience if demonstrated, not merely planned.
4. Each PR passes `pnpm build`, `pnpm check`, `pnpm test`, and its focused integration checks; update the POC-only README language and links as features ship.

## After this milestone — candidates, not commitments

- **Editor hardening:** production LSP if the spike supports it; worker/process isolation, cancellation, incremental parsing/caching, multi-root and project-reference support, better source mapping, TypeScript upgrade tests, and editor package/distribution workflows. Semantic tokens may be worthwhile only after basic lexical highlighting is solid.
- **Language growth:** math built-ins, richer vector packing and scalar/vector rules, comparisons/conditionals, then control flow or user functions with an explicit static shader model. Each feature still needs TS-virtual/core parity and two-backend tests.
- **Resources and stages:** custom uniforms with a defined host-facing binding/layout and update API; textures/samplers with explicit coordinate/upload conventions; vertex-stage authoring and varying interfaces. Treat these as design milestones, not quick syntax additions.
- **Runtime and quality:** WGSL/WebGPU pixel rendering and parity with WebGL; source-to-generated-code mapping and runtime error attribution; REPL compiler bundle profiling before choosing a browser-parser strategy; documentation, example gallery, and releases.
- **Standalone TypeScript:** revisit `tsc` integration only if an official content-mapping/virtual-file API becomes viable. Until then, keep `shdr check` and ordinary TypeScript checking as distinct tools.

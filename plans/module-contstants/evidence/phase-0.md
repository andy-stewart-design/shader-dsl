# Phase 0 evidence — baseline and type-bridge feasibility

Date: 2026-10-19 (local worktree; see command environment below)

## Scope

This note records Step 0.1 characterization only. No production parser, compiler,
editor adapter, graph, or runtime behavior was changed. The only added source is
the focused in-memory characterization test:

- `packages/language-service/test/module-constant-feasibility.test.ts`

The separate square-matrices worktree move was left untouched.

## Environment

- Node: `v24.21.0`
- pnpm: `11.23.0`
- TypeScript: `7.0.2`
- Package manager/workspace: pnpm 11 / Turbo workspace

## Baseline commands

All focused baselines passed:

- `pnpm --filter @shdr/core check`
- `pnpm --filter @shdr/core test` — 58 files, 510 tests passed
- `pnpm --filter @shdr/language-service check`
- `pnpm --dir packages/language-service exec vitest run --config ../../vitest.config.ts --root . --exclude test/module-constant-feasibility.test.ts` — 18 files, 105 tests passed (pre-feature baseline)
- `pnpm --filter @shdr/cli check`
- `pnpm --filter @shdr/cli test` — 2 files, 27 tests passed
- `pnpm --filter @shdr/runtime check`
- `pnpm --filter @shdr/runtime test` — existing WebGL and presented-WebGPU
  browser suites passed, including browser, uniforms, textures, math, matrices,
  horizon-burn, and plasma checks

The first parallel language-service invocation was canceled by the harness after
reporting 18 files / 105 tests passed. The explicit excluded-file command above is
the definitive pre-feature baseline; the standalone post-characterization rerun
passed 19 files / 110 tests.

After adding the characterization, the language-service suite passed standalone:

- `pnpm --filter @shdr/language-service check`
- `pnpm --filter @shdr/language-service test` — 19 files, 110 tests passed

Focused verification also passed:

- `pnpm --dir packages/language-service exec vitest run --config ../../vitest.config.ts --root . test/module-constant-feasibility.test.ts` — 5 tests passed
- `pnpm exec prettier --check packages/language-service/test/module-constant-feasibility.test.ts`

These browser results are pre-feature runtime baselines, not module-constant
acceptance evidence.

## TypeScript 7 / virtual-source probe

The characterization test uses an in-memory candidate virtual source; it does not
change the production transformer.

Observed current behavior:

- A same-file scalar `const RADIUS = 0.1` referenced by a fragment/helper is
  rejected by core as `SHDR1108` (`ClosureCapture`).
- A top-level vector constructor written with authored numeric arguments produces
  the ordinary TypeScript argument error (`2345`) because the public constructor
  signatures require `Expr<F32>` inputs.
- An ordinary `const RADIUS = 0.1; const copy: number = RADIUS` remains valid in
  an ordinary TypeScript source.
- Unused top-level host code remains outside the shader boundary and does not
  start producing Shdr diagnostics.

Bounded candidate strategy tested successfully:

- Leave the authored scalar declaration unchanged, so its declaration/ordinary
  use remains a TypeScript numeric value.
- In the generated shader view, add a shader-local alias with
  `__shdr_internal_f32(...)` at the callback/helper boundary. Authored shader
  references remain identity-mapped and resolve to `Expr<F32>`.
- Rewrite eligible vector initializer inputs and shader numeric/operator
  expressions in the generated view to the existing internal bridge/operators.
- Treat only eligible module-constant ranges as shader-owned for routing the
  original TypeScript constructor diagnostics; do not mark unrelated host code.

The TypeScript 7 checker accepted the candidate with no syntactic or semantic
errors. It returned `Expr<F32>` QuickInfo at the original scalar shader use while
returning the authored scalar declaration as `0.1` (not `Expr<F32>`). Diagnostic
routing produced no residual errors. The same approach passed for a helper-only
virtual region, with the hover mapped back to the helper's authored constant use.

This demonstrates feasibility of a bounded shader-only bridge and source mapping;
it is not implementation or end-to-end feature support.

## Source-graph characterization

Static inspection and focused in-memory checks found:

- `parseShaderFile` / `parseShaderFunctions` identify fragment and helper
  boundaries, while `validateShaderSyntax` currently rejects outer identifiers
  before lowering.
- `shader-module-graph.ts` loads each helper definition with its defining module,
  lowers each definition once, and attributes helper lowering diagnostics to that
  module. Imported shader exports currently consist of recognized helper and
  uniform-schema exports; there is no constant export/import kind.
- A helper-only module using a private constant currently reports
  `SHDR1108` in the helper's defining file/range, even when called by an entry
  module.
- A direct attempted constant import currently remains outside the graph's
  recognized export protocol and is rejected as a closure capture in the entry
  source. This confirms that constant imports must not be added accidentally by
  broadening existing source-import handling.
- Unused host declarations are not traversed by shader syntax lowering, so the
  future collector must remain on-demand and shader-referenced.

The narrow implementation seams are therefore: a per-source eligible-constant
collector; validator/lowering resolution after shader-local names but before the
existing outer-capture failure; defining-file constant environments in graph
helper lowering; and virtual-source rewriting/mapping for both fragment and
helper regions. Module-constant declaration ranges must be tracked separately
from ordinary host ranges so original TypeScript diagnostics are suppressed only
for accepted shader declarations and invalid definitions remain source-owned.

## Gate decision

Phase 0.1 completion and Phase 0 exit criteria are met: the bounded editor/source-
graph approach appears feasible, the shader-only scope is preserved, defining-file
ownership is understood, and baseline failures/results are recorded here. No
production capability or publication approval is claimed.

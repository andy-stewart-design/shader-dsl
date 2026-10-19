# Step 2.2 evidence — project consumers and static isolation

Date: 2026-10-19

## Coverage

Consumer paths now have explicit module-constant fixtures:

- CLI checks a private helper constant, reports an invalid helper edit at the
  defining file, recovers after restoration, rejects a direct constant import,
  and keeps uniform defaults literal-only.
- Project loading compiles a defining-file helper constant, preserves its
  canonical file ID, and reports a subsequent invalid helper edit in that file.
- Vite plugin tests compile a helper-owned constant, re-transform the entry after
  editing the helper, track the helper as a watched dependency, and reject
  invalid helper captures, imported constants, and nonliteral uniform defaults.
- The Vite production fixture includes a fragment using scalar/vector constants;
  its generated artifact contains the value but no authored constant names.
  Existing bundle checks continue to reject parser/compiler modules and authored
  shader DSL/runtime source from static output.
- Existing Vite dev/HMR verification continues to exercise helper edits,
  dependent entries, browser reloads, schemas, uniforms, and stale failure
  recovery. Existing schema declarations, bindings, and resource metadata remain
  covered by the prior fixtures.

## Verification

- `pnpm --filter @shdr/cli check` — passed
- `pnpm --filter @shdr/cli test` — 2 files, 28 tests passed
- `pnpm --filter @shdr/vite check` — passed
- `pnpm --filter @shdr/vite test` — 2 files, 23 tests passed
- `pnpm --filter @shdr/project check` — passed
- `pnpm --filter @shdr/project test` — 4 tests passed
- `pnpm --filter vite-basic check` — passed
- `pnpm --filter vite-basic test` — production build, dev/HMR, browser render,
  texture, and static-bundle checks passed
- `git diff --check` — passed

The static bundle contains no compiler/parser execution path and consumes only
the compiled default artifact. No constant runtime export/import or new uniform
binding was introduced.

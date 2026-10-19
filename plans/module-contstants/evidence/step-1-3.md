# Step 1.3 evidence — helper and multi-file graph ownership

Date: 2026-10-19

## Implementation and ownership

The existing Step 1.2 graph plumbing was exercised and completed for helper
ownership:

- Each parsed graph module carries its own `moduleConstants` map.
- `lowerFunction` passes the defining helper module's map to
  `lowerShaderBody`; the fragment caller's constants are not consulted.
- Root fragment lowering receives only the entry module's constants.
- Helper-only/check-only modules use the same parser and lowering path, so
  invalid referenced constants are diagnosed even without a default fragment.
- Imported constants do not become graph exports or dependencies. They remain
  unsupported captures, while named helper/schema imports keep their existing
  resolution rules.
- Graph errors are attached once to the defining file/range before caller
  lowering, preventing cascaded caller diagnostics and artifacts.

## Coverage

`packages/core/test/module-constants.test.ts` now verifies:

- A private helper constant and alias are used from an imported helper while two
  separate entries importing the same helper produce identical artifacts.
- Helper parameters and fragment locals shadow same-spelling module constants;
  the defining helper constant environment remains isolated.
- A helper-only `checkShaderGraph` succeeds for a valid private constant.
- An invalid helper initializer produces exactly one defining-file diagnostic in
  check-only mode and in a consuming graph, with no artifact.
- Imported constants used by helper bodies are rejected as `ClosureCapture` in
  the helper's authored file.
- Existing imported-helper target/artifact tests continue to pass.

## Verification

- Focused graph/module suites: 2 files, 36 tests passed
- `pnpm --filter @shdr/core check` — passed
- `pnpm --filter @shdr/core test` — 59 files, 531 tests passed
- `pnpm build` — 11 packages/tasks passed
- Real WebGL 2 link and WGSL pipeline tests passed within the core suite
- `git diff --check` — passed

No new constant export/import protocol, runtime binding, or emitted named
constant was introduced. Phase 2 editor/consumer/rendered-pixel work remains
pending.

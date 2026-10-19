# Step 1.2 evidence — fragment capture, IR, and target codegen

Date: 2026-10-19

## Implementation

Module constants now flow through the existing source-only pipeline:

- `parse-shader-file.ts` and `parse-shader-functions.ts` collect only referenced
  same-file top-level constant names and validate them with the new classifier.
- `validate-shader-syntax.ts` accepts only the classifier's eligible names; all
  other outer identifiers retain capture/unknown diagnostics.
- `lower-shader-syntax.ts` receives a per-file constant environment and inlines
  target-neutral numeric/vector constructor expressions into the existing IR.
  No host initializer is evaluated, no runtime binding is added, and no emitted
  module constant name is required.
- `lower-shader-functions.ts`, `lower-fragment.ts`, and
  `shader-module-graph.ts` pass the defining-file environment through helper and
  fragment lowering. Imported helpers therefore retain their own constants.

The existing invalid capture fixture was changed from an eligible literal to an
unsupported host initializer so it continues to characterize rejection. The
ordinary editor/core capture cases were similarly kept outside the newly accepted
literal subset.

## Coverage

`packages/core/test/module-constants.test.ts` covers:

- fragment scalar/vector constants, aliases, and supported constructor shapes;
- local/helper shadowing behavior through existing lowering paths;
- imported helper graphs using constants from their defining file;
- invalid initializer/capture diagnostics and no artifact;
- literal-only uniform defaults remaining required;
- unchanged artifact defaults/custom/resource metadata;
- signed-zero emission for GLSL and WGSL;
- real WebGL 2 shader compilation and program link;
- real WebGPU shader-module compilation and render-pipeline creation.

The generated code is inlined: module names such as `RADIUS`, `CENTER`, and
`FACTOR` do not appear as generated shader bindings or globals.

## Verification

- `pnpm --filter @shdr/core check` — passed
- `pnpm --filter @shdr/core test` — 59 files, 528 tests passed
- `pnpm --filter @shdr/core build` — passed
- `pnpm --filter @shdr/language-service check` — passed
- `pnpm --filter @shdr/language-service test` — 19 files, 110 tests passed
- Focused module-constant target test — 18 tests passed, including real WebGL 2
  and WebGPU validation
- `git diff --check` — passed

This is static/core target acceptance only. Editor source mapping, CLI/Vite/REPL
parity, and rendered pixel acceptance remain pending in Steps 2.1–2.3.

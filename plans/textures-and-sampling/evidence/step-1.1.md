# Step 1.1 evidence

Date: 2026-10-13

## Implemented boundary

- Added typed `u.texture2D(url)` declarations and a non-numeric `Texture2D` shader handle to the public `shdr` types.
- Numeric `HostUniforms` and runtime `setUniforms`/`resetUniforms` remain numeric-only; texture keys are rejected by the static/runtime boundaries.
- Core parsing accepts only literal root-absolute URLs or external HTTPS URLs, records `urlKind`, and reports malformed/dynamic/duplicate/reserved declarations at authored ranges without evaluating source.
- Mixed schemas preserve numeric declarations in the existing `custom` metadata and place texture declarations in separate `resources.textures` JSON metadata.
- Same-file chained/named schemas and imported schemas produce the same artifact. Unused texture declarations do not alter generated GLSL/WGSL or create numeric bindings.
- Runtime validates resource metadata at the artifact boundary without fetching or decoding unused textures. The browser uniform suite creates renderers with an unused texture declaration and observes zero fetches.

The user-provided `apps/vite-basic/public/abstract-01.jpg` remains unrelated user work and was not modified or consumed by this declaration-only step.

## Verification

- `pnpm --filter shdr check && pnpm --filter shdr test`: passed, 7 tests.
- `pnpm --filter @shdr/core check && pnpm --filter @shdr/core test`: passed, 47 files / 427 tests.
- `pnpm --filter @shdr/runtime check`: passed.
- `pnpm --filter @shdr/runtime test`: passed all existing browser suites, including unused-resource zero-fetch coverage.
- Focused `packages/runtime/test/texture-metadata.test.ts`: passed, 6 tests.
- `git diff --check`: passed.

No image sampling, GPU resource loading, or renderer texture binding was added; those remain in Steps 1.2–2.3.

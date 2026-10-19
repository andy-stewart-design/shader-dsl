# Step 1.1 evidence — on-demand module-constant classification

Date: 2026-10-19

## Implementation boundary

Added the source-only classifier:

- `packages/core/src/parse-module-constants.ts`
- exported from `packages/core/src/index.ts`
- focused tests in `packages/core/test/module-constants.test.ts`

This step does not admit module captures into fragment/helper lowering. Existing
capture validation and generated-target behavior remain unchanged; the classifier
is an in-memory, on-demand preparation seam for the later capture steps.

## Accepted classification

For explicitly supplied authored references, the classifier resolves only:

- finite f32 scalar literals, including unary negative literals;
- earlier same-file eligible aliases;
- directly imported `vec2`, `vec3`, and `vec4` constructor forms supported by
  the existing DSL signatures;
- scalar/vector shape information and source ranges for each resolved definition.

The classifier does not execute source or access the filesystem. It inspects
unrequested top-level declarations only enough to index them; unsupported unused
host initializers remain inert.

## Rejections and ownership

Focused tests cover authored ranges for:

- forward and self references;
- arithmetic and unsupported calls/identifiers;
- wrong-shape vector constructors;
- non-finite/f32-overflow literals;
- imported values and direct constructor-import requirements;
- unsafe/conflicting names;
- multiple declarators and annotated declarations;
- `defineShaderFunction`/`defineUniforms` marker declarations;
- a private constant being visible only when classified against its defining
  source, not another source.

Existing graph/source inspection from Phase 0 remains unchanged: helper definitions
are lowered in their defining file, and the graph still has no constant export or
import kind. This classifier does not broaden that protocol.

## Verification

- `pnpm --filter @shdr/core check` — passed
- `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/module-constants.test.ts` — 13 tests passed
- `pnpm --filter @shdr/core test` — 59 files, 523 tests passed
- `git diff --check` — passed

The full core suite preserves the existing outer-capture behavior. No browser or
generated-target acceptance is claimed for this static-classification step.

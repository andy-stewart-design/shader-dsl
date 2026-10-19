# Step 2.1 evidence — shader-only virtual typing and source-ranged editor results

Date: 2026-10-19

## Implementation

The TypeScript 7 virtual source now transforms eligible module constant
initializers only when they are referenced by a parsed shader region:

- scalar and negative literals become `__shdr_internal_f32(...)` expressions;
- vector constructor arguments are recursively transformed;
- earlier aliases remain identity-backed references to shader-typed constants;
- module declaration ranges are included in shader regions so invalid constant
  diagnostics suppress TypeScript cascades without taking ownership of ordinary
  `.ts` code;
- helper-only modules receive the same transformation and mappings;
- source mappings preserve authored declaration/use ranges for QuickInfo and
  diagnostics.

The editor adapter reopens changed module-constant files before virtual checking.
Existing project-version invalidation refreshes imported-helper consumers.

## Coverage

`packages/language-service/test/module-constants-editor.test.ts` covers:

- scalar declaration QuickInfo remains a number while shader uses resolve as
  `Expr<F32>`; vector declaration/use QuickInfo retains the corresponding
  `Vec2<F32>` type;
- ordinary TypeScript delegation;
- same-file helper constants and imported helper consumers;
- helper constant edit, invalid capture diagnostic, consumer refresh, and restore;
- arithmetic initializer rejection without a TypeScript diagnostic takeover.

`apps/editor-fixture/module-constants.shdr.ts` and the real VS Code extension
fixture cover authored hover locations, invalid `SHDR1108` diagnostics, and
edit/restore behavior. Existing helper/imported-helper editor flows remain in
place.

## Verification

- `pnpm --filter @shdr/core check` — passed
- `pnpm --filter @shdr/core test` — 59 files, 531 tests passed
- `pnpm --filter @shdr/language-service check` — passed
- `pnpm --filter @shdr/language-service test` — 20 files, 113 tests passed
- `pnpm --filter @shdr/editor-fixture check` — passed
- `pnpm --filter @shdr/editor-fixture test` — 3 tests passed
- `pnpm --filter @shdr/editor-fixture test:editor` — real VS Code fixture passed,
  including module-constant declaration/use hovers and edit/restore checks
- Core and language-service builds passed
- `git diff --check` — passed

No ordinary `.ts` source was transformed, no authored module was executed, and
no LSP transport migration was introduced.

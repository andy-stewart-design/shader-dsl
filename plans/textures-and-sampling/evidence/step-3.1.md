# Step 3.1 evidence

Date: 2026-10-14

## Automated verification

- `pnpm --filter @shdr/vite test` passed (21 tests), including root-absolute, HTTPS and relative artifact URL metadata cases.
- `pnpm --filter vite-basic check` passed.
- `pnpm --filter vite-basic build` passed; the existing main browser bundle remained compiler/parser-free.
- `pnpm --filter vite-basic test` passed, including the existing dev/build/render checks and `verify-texture.mjs`.
- The focused production texture bundle was checked for compiler/parser markers and remained renderer-plus-static-artifact only.
- The isolated texture page was verified in Vite dev mode and production builds under `/nested/` and `./` bases.
- Browser requests resolved to `/abstract-01.jpg`, `/nested/abstract-01.jpg`, and `/relative/abstract-01.jpg` respectively.
- Real WebGL readback at three image locations matched the decoded `abstract-01.jpg` pixels within tolerance in all three deployments, including distinct samples that prove the page is not a flat-color fixture.

## Isolation

The example is a separate `texture.html` entry. `apps/vite-basic/src/main.ts`, `vite.config.ts`, existing renderer canvases, and workspace watch scripts were not changed. The production texture verification supplies its Rollup input only to the focused programmatic Vite build; the normal app build remains single-entry.

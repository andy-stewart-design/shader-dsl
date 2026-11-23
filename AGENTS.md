**In general:**

- Speak in plain language. Avoid jargon and unnecessarily technical or loaded descriptors.
- When asking questions, ask them one at a time.
- Read the full contents of a file every time, never subsets so you don't miss important context.

**When working in typescript:**

- Never manually edit lockfiles. Generate dependency and resolution changes with package-manager commands.
- When adding a package to a project, add it with an install command instead of manually editing `package.json` directly.
- Run check/format/lint commands when you’re done making a change. If they don't exist, suggest making them for the project you're in.
- Avoid explicit return types unless absolutely needed.
- Casting with `as any` should be a last resort. Always use real type safety. Lean on type inference instead of manually writing new types.
- Avoid running the `dev` command. If you really need to, ask first.

**Test layout:**

- Prefer domain-local `__tests__/` directories for unit tests and package-level `src/__tests__/` directories for cross-domain integration/public API tests.
- Keep test-only fixtures and helpers in the relevant suite's `support/` directory; do not name support modules `*.test.ts`.
- Production modules must never import from `__tests__/`. Keep tests included in TypeScript checking.
- Adopt this convention incrementally when working in the relevant area, not through a repository-wide migration.

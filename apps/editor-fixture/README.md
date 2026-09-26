# TypeScript 7 editor fixture

This is the Phase 3 editor go/no-go fixture. It exercises the packaged editor adapter against VS Code **1.127.0** and the repository-pinned TypeScript **7.0.2**.

## Proven integration path

The released TypeScript 7.0.2 language server and matching `TypeScriptTeam.native-preview` 0.20260708.2 extension have no diagnostic/hover middleware or content-mapper extension point. Instead, the fixture:

1. Registers `.shdr.ts` as the dedicated `shdr-typescript` VS Code language ID, so the native TypeScript provider does not publish diagnostics for shader modules.
2. Registers a VS Code `DiagnosticCollection` and `HoverProvider` for that language ID.
3. Delegates document checking, diagnostic routing, source mapping, QuickInfo, and source/project-version caching to `TypeScript7EditorAdapter` from `@shdr/language-service`.
4. Keeps the unstable `typescript/unstable/sync` API and TypeScript AST details private inside `@shdr/language-service`.
5. Publishes the adapter's compiler-independent results through stable VS Code diagnostic and hover APIs.

Ordinary TypeScript inside a shader module is checked through the same TypeScript 7 project and preserved by identity mappings. Ordinary `.ts` modules keep the standard TypeScript editor provider. For lexical coloring, a contributed TextMate grammar under `source.shdr.ts` includes VS Code's built-in `source.ts` scope: TypeScript tokens are colored without defining a shader regex grammar or altering semantic diagnostics.

## Fixture files

- `gradient.shdr.ts`: the target shader plus an intentional ordinary TypeScript error outside its callback.
- [`expanded.shdr.ts`](expanded.shdr.ts): arithmetic, `vec2`/`vec3`, unary minus, and repeated/reordered read swizzles; see the [language reference](../../README.md#accepted-shader-language).
- `test/fixtures/invalid.shdr.ts`: an invalid `coord.xy / coord` shader operation with one mapped diagnostic.
- `ordinary.ts`: a deliberate hover location owned by the standard TypeScript provider.
- `.vscode/settings.json`: enables TS Go and points editor TypeScript tooling at the workspace TypeScript installation.

## Workspace setup

From the repository root:

```sh
pnpm install
pnpm build
code \
  --extensionDevelopmentPath="$PWD/apps/editor-fixture" \
  "$PWD/apps/editor-fixture"
```

In the Extension Development Host:

1. Run **TypeScript: Select TypeScript Version** and choose **Use Workspace Version** if the command is available.
2. Confirm the selected workspace version is **7.0.2**. The adapter itself also resolves the fixture's exact `typescript@7.0.2` dependency.
3. Run **Developer: Reload Window** after changing the TypeScript selection or `.vscode/settings.json`.

The successful pinned run used:

- VS Code 1.127.0
- TypeScript 7.0.2
- `TypeScriptTeam.native-preview` 0.20260708.2 for protocol investigation; the Shdr provider does not depend on that extension.

## Manual checklist

1. Open `gradient.shdr.ts` and confirm the only diagnostic is the intentional `ordinaryOutside` number-to-string error.
2. Confirm no native `/`, `uv.x`, or `uv.y` cascade errors appear inside the callback.
3. Hover `uv` in `uv.x` and confirm `Expr<Vec2<F32>>`.
4. Change `coord.xy / uniforms.resolution` to `coord.xy / coord` and confirm exactly one additional diagnostic covers the complete division expression.
5. Confirm its message starts with `Operator "/" cannot be applied` and contains no internal helper name.
6. Replace that expression with `(coord.xy / uniforms.resolution) / uniforms.resolution`; confirm the shader remains valid and the `uv` hover remains `Expr<Vec2<F32>>`.
7. Restore the original expression.
8. Open `test/fixtures/invalid.shdr.ts` and confirm its sole diagnostic covers `coord.xy / coord`.
9. Open `expanded.shdr.ts` and confirm zero diagnostics. Hover `reordered` and `repeated` to verify `Expr<Vec3<F32>>` and `Expr<Vec4<F32>>`. Change `uniforms.time * uniforms.time` to `uniforms.time * coord.xy` and confirm one mapped, helper-free operator diagnostic; restore the source.
10. Run **Developer: Inspect Editor Tokens and Scopes** on `expanded.shdr.ts`. Confirm `import` has a `keyword.control.import.ts` scope under `source.shdr.ts`, `"shdr"` has a `string.quoted.double.ts` scope, and a numeric literal has a `constant.numeric.decimal.ts` scope. Confirm syntax colors appear for keywords, operators, strings, and numbers; lexical coloring does not validate shader semantics.
11. Open `ordinary.ts`, confirm its language is TypeScript (`source.ts` in the token inspector), and hover `ordinaryValue` to verify the standard provider remains active.

## Automated real-VS-Code verification

```sh
pnpm --filter @shdr/editor-fixture build
pnpm --filter @shdr/editor-fixture test:editor
```

`pnpm --filter @shdr/editor-fixture test` tokenizes the expanded fixture with VS Code's installed TypeScript TextMate grammar, asserting `source.shdr.ts` and real TypeScript lexical scopes when the grammar is available. `test:editor` starts the installed VS Code executable in an isolated Extension Development Host and automates the Shdr-owned language-ID and semantic checklist, including live invalid arithmetic and nested-division edits plus expanded Vec3/Vec4 hovers. VS Code has no public token-inspection API for extensions, so perform the visual/token-inspector check above manually. It does not assert hovers from VS Code's standard TypeScript provider for ordinary `.ts` files; verify that behavior with the manual checklist above. Set `VSCODE_EXECUTABLE_PATH` if VS Code is not installed at the default macOS path used by `run-editor-test.mjs`.

## Standalone TypeScript limitation

This fixture proves editor diagnostics and hovers only. It does **not** claim that standalone `tsc --noEmit` understands shader operator semantics; standalone TypeScript does not apply the editor's virtual source. The Vite integration does not change that limitation.

This remains a feasibility implementation: it performs synchronous TypeScript API work on the extension host and assumes one workspace root and one `tsconfig.json`. The VS Code layer is thin; checker and routing behavior lives in `@shdr/language-service`.

# TypeScript 7 editor feasibility fixture

This is the Phase 3.0 VS Code extension spike. It proves an editor-routing path against VS Code 1.127.0 and the repository-pinned TypeScript 7.0.2.

## Proven integration path

The released TypeScript 7.0.2 language server and matching `TypeScriptTeam.native-preview` 0.20260708.2 extension have no diagnostic/hover middleware or content-mapper extension point. Instead, the spike:

1. Registers `.shdr.ts` as the dedicated `shdr-typescript` VS Code language ID, so the native TypeScript provider does not publish diagnostics for shader modules.
2. Registers a VS Code `DiagnosticCollection` and `HoverProvider` for that language ID.
3. Creates virtual source with `@shdr/core`.
4. Uses the unstable `typescript/unstable/sync` `API` with an in-memory `fs.readFile` overlay to make TypeScript 7 check the virtual source in its real `tsconfig.json` project.
5. Maps diagnostics and hover positions between generated and original source.

Ordinary TypeScript inside a shader module is checked through the same TypeScript 7 `Program` and preserved by identity mappings. Ordinary `.ts` modules keep the normal TypeScript editor provider.

The TypeScript 7 dependencies selected for the next adapter are unstable: `API`, `updateSnapshot`, `getDefaultProjectForFile`, `Program` diagnostics, and `Checker` type queries from `typescript/unstable/sync`. VS Code's language, diagnostic, and hover provider APIs are stable.

The content-mapper protocol currently present on the `microsoft/typescript-go` main branch was investigated but rejected for this pinned-version spike: neither TypeScript 7.0.2 nor the matching native-preview extension ships it. Standalone `tsc` also does not apply editor virtual source.

## Automated real-VS-Code verification

```sh
pnpm --filter @shdr/editor-fixture build
pnpm --filter @shdr/editor-fixture test:editor
```

`test:editor` starts the installed VS Code executable in an isolated Extension Development Host and verifies:

- `gradient.shdr.ts` is assigned the dedicated language ID.
- The ordinary `number`-to-`string` error outside the callback remains.
- Native `/`, `uv.x`, and `uv.y` cascade errors are absent.
- Hovering `uv` reports `Expr<Vec2<F32>>`.
- Hover outside the callback still reports the TypeScript `string` type.
- `invalid.shdr.ts` reports one source-ranged `SHDR1100` diagnostic.

Set `VSCODE_EXECUTABLE_PATH` if VS Code is not installed at the default macOS path used by `run-editor-test.mjs`.

## Manual verification

Run the extension fixture in a VS Code Extension Development Host, then open `gradient.shdr.ts` and `invalid.shdr.ts`. The expected results are the same as the automated checklist above.

This remains a feasibility implementation: it performs synchronous TypeScript API work on the extension host, assumes one workspace root and one `tsconfig.json`, and has not yet moved the checker/provider adapter into `@shdr/language-service`.

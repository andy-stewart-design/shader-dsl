# Shdr LSP transport spike (Phase 3.2.1)

`@shdr/lsp` is a **local, unshipped stdio LSP process** around the same `TypeScript7EditorAdapter` used by the VS Code fixture. It does not contain another shader checker. Protocol behavior was tested independently; the [`experiments/zed-shdr`](../../experiments/zed-shdr) dev extension also launches it when `apps/editor-fixture` is opened as a Zed workspace. The VS Code fixture continues using its existing adapter directly.

From the repository root:

```sh
pnpm build
node packages/lsp/dist/bin.mjs
```

The server reads and writes LSP `Content-Length` frames on stdin/stdout; a real LSP client must initialize it with a repository/workspace `rootUri`. The protocol test launches the built process and checks `initialize`, `didOpen`, full and incremental `didChange`, `didClose`, original-source `publishDiagnostics` ranges, an `Expr<Vec2<F32>>` hover, out-of-order document-version rejection, unsupported shader syntax, TypeScript parse failures and recovery, `shutdown` and `exit`. It also verifies that ordinary `.ts` documents are ignored. Run it with `pnpm --filter @shdr/lsp test`.

**Boundaries for the spike:** Only `file:` URIs ending in `.shdr.ts` are checked. Position conversion uses UTF-16 offsets, matching both TypeScript and LSP. The first initialized workspace folder (or `rootUri`) and its `tsconfig.json` are used for the whole process; project/config changes, multiple roots, project references and non-file URIs are not supported. Checking is synchronous on the LSP event loop, so cancellation cannot interrupt a check already running. Document versions prevent stale **incoming** edits from replacing newer state, but there is no concurrent-check scheduling. A real Zed 1.21.0 session verified one Shdr diagnostic and a mapped hover within the editor-fixture workspace. Do not treat this as a production server or claim general project support, packaging, cancellation or config refresh.

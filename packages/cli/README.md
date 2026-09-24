# Shdr checker CLI — command contract

**Phase 1.1 only:** this package currently defines and tests the command-line contract and path discovery. It does **not** provide an executable `shdr` command or check shader sources yet. Phase 1.2 will wire this contract to `@shdr/core`, add diagnostic reporting, and install the `shdr` binary. Do not use this package in CI until then.

## Planned invocation

```sh
shdr check [paths...]
shdr --help
shdr check --help
```

With no paths, `check` recursively discovers `.shdr.ts` files from the current working directory. Explicit arguments may be `.shdr.ts` files or directories (searched recursively). Results are deduplicated and sorted by their path relative to the current directory using lexical ordering. A path starting with `-` must follow `--`. Unknown commands and options are errors; there is no configuration or target selection in this milestone.

Default recursive traversal skips directory names `.git`, `.turbo`, `node_modules`, `dist`, `build`, and `coverage` at any depth. Explicit **files** under those directories are included. Explicit **directories** with an ignored name are searched, but their nested ignored directories remain skipped. Symlinks are never followed; explicit symlink paths are errors. Ordinary `.ts` files are ignored during traversal and rejected if passed explicitly. Missing or unreadable paths are errors. **No matches is an error**, including when running with no paths, so a misconfigured CI job cannot pass without checking anything.

## Planned results

- One human-readable diagnostic per line: `path:line:column: SHDRnnnn: message`. Paths are relative to the working directory where possible; positions are 1-based and refer to original `.shdr.ts` source, not virtual TypeScript or generated shader text. Files are ordered by path; diagnostics within a file are ordered by source range and then code. No internal helper names are printed.
- Exit **0**: at least one file checked, no Shdr diagnostics (or help requested). Exit **1**: one or more Shdr diagnostics. Exit **2**: usage, path, no-match, or I/O failure. If files are inaccessible, fail rather than reporting a partial success. JSON output is not part of this contract.
- `shdr check` will call `@shdr/core` for Shdr boundary/syntax/semantic diagnostics. It will **not** type-check ordinary TypeScript code outside callbacks, check project references, or make standalone `tsc --noEmit` understand shader operators. Run the ordinary workspace TypeScript checks (`pnpm check`) alongside `shdr check` in CI; keep `.shdr.ts` out of standalone `tsc` projects that cannot process it.

## Phase 1.1 verification

`pnpm --filter @shdr/cli test` covers argument parsing, help, exit-code classification, no matches, explicit/ignored paths, ordering, deduplication, and symlink behavior. Binary integration and actual diagnostic tests belong to Phase 1.2.

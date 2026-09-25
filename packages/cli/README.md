# Shdr checker CLI

`@shdr/cli` is a Node-only command-line adapter over the filesystem-independent `@shdr/core`. Build the workspace first, then run from the repository root:

```sh
pnpm build
pnpm shdr check
```

The `@shdr/cli` package also declares a `shdr` executable for consumers that install/link it. The root `pnpm shdr` script runs the built binary without changing the working directory.

## Invocation

```sh
shdr check [paths...]
shdr --help
shdr check --help
```

With no paths, `check` recursively discovers `.shdr.ts` files from the current working directory. Explicit arguments may be `.shdr.ts` files or directories (searched recursively). Results are deduplicated and sorted by their path relative to the current directory using lexical ordering. A path starting with `-` must follow `--`. Unknown commands and options are errors; there is no configuration or target selection in this milestone.

Default recursive traversal skips directory names `.git`, `.turbo`, `node_modules`, `dist`, `build`, and `coverage` at any depth, plus `test/fixtures` directories containing intentionally invalid shader samples. Explicit **files** under those directories are included. Explicit **directories** that would otherwise be ignored are searched, but nested ignored directories remain skipped. Symlinks are never followed; explicit symlink paths are errors. Ordinary `.ts` files are ignored during traversal and rejected if passed explicitly. Missing or unreadable paths are errors. **No matches is an error**, including when running with no paths, so a misconfigured CI job cannot pass without checking anything.

## Results

- On a clean check, print `Checked 1 shader file: no Shdr diagnostics.` (with the appropriate file count/plural) to stdout.
- On failure, print one human-readable diagnostic per line: `path:line:column: SHDRnnnn: message`. Paths are relative to the working directory where possible; positions are 1-based and refer to original `.shdr.ts` source, not virtual TypeScript or generated shader text. Files are ordered by path; diagnostics within a file are ordered by source range and then code. No internal helper names are printed.
- Exit **0**: at least one file checked, no Shdr diagnostics (or help requested). Exit **1**: one or more Shdr diagnostics. Exit **2**: usage, path, no-match, or I/O failure. If files are inaccessible, fail rather than reporting a partial success. JSON output is not part of this contract.
- `shdr check` calls `@shdr/core` for Shdr boundary/syntax/semantic diagnostics. It will **not** type-check ordinary TypeScript code outside callbacks, check project references, or make standalone `tsc --noEmit` understand shader operators. Run the ordinary workspace TypeScript checks (`pnpm check`) alongside `shdr check` in CI; keep `.shdr.ts` out of standalone `tsc` projects that cannot process it.

## CI usage and verification

Run ordinary TypeScript checks and Shdr checks as separate commands after building:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm shdr check
```

`pnpm ci:check` runs the last two steps for this repository, discovering authored shaders throughout the workspace without maintaining a file list. Intentionally invalid examples live under `test/fixtures`, which default discovery skips; explicitly passing a fixture file or directory still checks it. The CLI package's TypeScript config also excludes `.shdr.ts` fixtures from standalone `tsc` checking. For another project, place negative fixtures under `test/fixtures` and keep shader files out of standalone `tsc` input.

`pnpm --filter @shdr/cli test` covers the argument/discovery contract and executable integration from outside the package, including original-source positions, diagnostics, output ordering, and exit codes.

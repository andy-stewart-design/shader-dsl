import { readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import {
  checkShaderGraph,
  type ShaderDiagnostic,
  type ShaderGraphDiagnostic,
} from "@shdr/core";
import { loadShaderGraph, ProjectInputError } from "@shdr/project";

import { CliInputError, type CheckOutcome } from "./contract.js";
import { discoverShaderFiles } from "./discover.js";

export interface CheckResult {
  readonly outcome: Extract<CheckOutcome, "clean" | "diagnostics">;
  readonly fileCount: number;
  readonly lines: readonly string[];
}

/** Checks all discovered modules; file/read errors never produce partial diagnostic output. */
export async function checkShaderPaths(
  paths: readonly string[],
  cwd: string,
  readSource: (file: string) => Promise<string> = (file) =>
    readFile(file, "utf8"),
): Promise<CheckResult> {
  const files = await discoverShaderFiles(paths, cwd);
  const searchRoots = await configSearchRoots(paths, cwd);
  const diagnostics = new Map<
    string,
    { readonly diagnostic: ShaderGraphDiagnostic; readonly source: string }
  >();
  for (const file of files) {
    let loaded;
    try {
      loaded = await loadShaderGraph({
        entry: file,
        searchRoots,
        readSource,
      });
    } catch (error) {
      if (error instanceof ProjectInputError) {
        throw new CliInputError(error.message, { cause: error.cause });
      }
      throw error;
    }
    const result = checkShaderGraph(loaded.input);
    if (result.ok) continue;
    for (const diagnostic of result.diagnostics) {
      const fileMap = loaded.input.files as ReadonlyMap<string, string>;
      const source =
        typeof fileMap.get === "function"
          ? fileMap.get(diagnostic.fileName)
          : (loaded.input.files as Readonly<Record<string, string>>)[
              diagnostic.fileName
            ];
      if (source === undefined) continue;
      const key = `${diagnostic.fileName}\0${diagnostic.code}\0${diagnostic.range.start}\0${diagnostic.range.length}\0${diagnostic.message}`;
      diagnostics.set(key, { diagnostic, source });
    }
  }
  const ordered = [...diagnostics.values()].sort((left, right) => {
    const leftPath = relative(cwd, left.diagnostic.fileName)
      .split(sep)
      .join("/");
    const rightPath = relative(cwd, right.diagnostic.fileName)
      .split(sep)
      .join("/");
    return (
      compare(leftPath, rightPath) ||
      left.diagnostic.range.start - right.diagnostic.range.start ||
      compare(left.diagnostic.code, right.diagnostic.code) ||
      left.diagnostic.range.length - right.diagnostic.range.length
    );
  });
  return {
    outcome: ordered.length > 0 ? "diagnostics" : "clean",
    fileCount: files.length,
    lines: ordered.map(({ diagnostic, source }) =>
      formatDiagnostic(
        relative(cwd, diagnostic.fileName).split(sep).join("/"),
        source,
        diagnostic,
      ),
    ),
  };
}

async function configSearchRoots(
  paths: readonly string[],
  cwd: string,
): Promise<readonly string[]> {
  const roots = new Set<string>([resolve(cwd)]);
  for (const path of paths) {
    const absolute = resolve(cwd, path);
    try {
      roots.add(
        (await stat(absolute)).isDirectory() ? absolute : dirname(absolute),
      );
    } catch {
      // discoverShaderFiles owns the user-facing path error; retain cwd here.
    }
  }
  return [...roots];
}

function formatDiagnostic(
  displayPath: string,
  source: string,
  diagnostic: ShaderDiagnostic,
): string {
  const offset = Math.max(0, Math.min(source.length, diagnostic.range.start));
  const before = source.slice(0, offset);
  const line = 1 + (before.match(/\n/g)?.length ?? 0);
  const column = offset - before.lastIndexOf("\n");
  const message = diagnostic.message.replace(/\r?\n/g, " ");
  return `${displayPath}:${line}:${column}: ${diagnostic.code}: ${message}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

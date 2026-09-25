import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

import { lowerFragment, type ShaderDiagnostic } from "@shdr/core";

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
  const lines: string[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = await readSource(file);
    } catch (error) {
      throw new CliInputError(
        `Cannot read shader file ${JSON.stringify(file)}.`,
        {
          cause: error,
        },
      );
    }
    const result = lowerFragment(source);
    if (result.ok) continue;

    const displayPath = relative(cwd, file).split(sep).join("/");
    const diagnostics = [...result.diagnostics].sort(
      (a, b) =>
        a.range.start - b.range.start ||
        compare(a.code, b.code) ||
        a.range.length - b.range.length,
    );
    for (const diagnostic of diagnostics) {
      lines.push(formatDiagnostic(displayPath, source, diagnostic));
    }
  }
  return {
    outcome: lines.length > 0 ? "diagnostics" : "clean",
    fileCount: files.length,
    lines,
  };
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

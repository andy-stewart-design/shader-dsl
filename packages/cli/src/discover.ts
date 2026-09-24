import { lstat, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { CliInputError } from "./contract.js";

export const IGNORED_DIRECTORIES = [
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
] as const;

const ignored = new Set<string>(IGNORED_DIRECTORIES);

/** Returns unique absolute paths, sorted by their display path relative to cwd. */
export async function discoverShaderFiles(
  paths: readonly string[],
  cwd: string,
): Promise<readonly string[]> {
  const files = new Set<string>();
  const roots = paths.length === 0 ? [cwd] : paths;

  async function visitDirectory(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new CliInputError(
        `Cannot read directory ${JSON.stringify(directory)}.`,
        {
          cause: error,
        },
      );
    }

    for (const entry of entries) {
      // Never follow symlinks, including a symlink to a directory.
      if (entry.isSymbolicLink()) continue;
      const fileName = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await visitDirectory(fileName);
      } else if (entry.isFile() && entry.name.endsWith(".shdr.ts")) {
        files.add(fileName);
      }
    }
  }

  for (const root of roots) {
    const absolute = resolve(cwd, root);
    let stats;
    try {
      stats = await lstat(absolute);
    } catch (error) {
      throw new CliInputError(`Cannot access path ${JSON.stringify(root)}.`, {
        cause: error,
      });
    }
    if (stats.isDirectory()) {
      // An explicit directory overrides the ignore rule for this root only.
      await visitDirectory(absolute);
    } else if (stats.isFile() && absolute.endsWith(".shdr.ts")) {
      // Explicit files override ignores (including files in node_modules).
      files.add(absolute);
    } else {
      throw new CliInputError(
        `Expected a .shdr.ts file or directory: ${JSON.stringify(root)}. Symlinks are not followed.`,
      );
    }
  }

  if (files.size === 0) {
    throw new CliInputError("No .shdr.ts files found in the requested paths.");
  }
  const display = (fileName: string): string =>
    relative(cwd, fileName).split(sep).join("/");
  return [...files].sort((a, b) =>
    display(a) < display(b) ? -1 : display(a) > display(b) ? 1 : 0,
  );
}

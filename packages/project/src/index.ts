import { parse } from "@babel/parser";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { API, type Project } from "typescript/unstable/sync";

import type { ShaderVirtualGraphInput } from "@shdr/core";

export type ProjectSelection =
  | {
      readonly status: "project";
      readonly configPath: string;
      readonly workspaceRoot: string;
      readonly rootFiles: readonly string[];
      readonly paths: Readonly<Record<string, readonly string[]>>;
    }
  | {
      readonly status: "excluded" | "no-config" | "invalid-config";
      readonly message: string;
      readonly configPath?: string;
      readonly workspaceRoot: string;
      readonly paths: Readonly<Record<string, readonly string[]>>;
    };

export class ProjectInputError extends Error {
  public override readonly cause: unknown;

  public constructor(
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message);
    this.name = "ProjectInputError";
    this.cause = options.cause;
  }
}

export interface LoadShaderGraphOptions {
  readonly entry: string;
  readonly searchRoots: readonly string[];
  readonly readSource?: (fileName: string) => Promise<string>;
}

export interface LoadShaderGraphSyncOptions {
  readonly entry: string;
  readonly searchRoots: readonly string[];
  readonly readSource?: (fileName: string) => string;
}

export interface LoadedShaderGraph {
  readonly input: ShaderVirtualGraphInput;
  readonly project: ProjectSelection;
}

/** Selects the nearest valid TS project whose root files include the entry. */
export function selectProject(
  entryFile: string,
  searchRoots: readonly string[],
): ProjectSelection {
  const entry = canonicalMaybe(entryFile);
  const roots = uniqueCanonicalDirectories(searchRoots);
  const workspaceRoot = deepestContaining(roots, entry) ?? dirname(entry);
  let directory = dirname(entry);
  let excluded: ProjectSelection | undefined;
  const api = new API({ cwd: workspaceRoot });
  try {
    while (true) {
      const configPath = resolve(directory, "tsconfig.json");
      if (existsSync(configPath)) {
        const selection = inspectConfig(api, configPath, entry, workspaceRoot);
        if (selection.status === "invalid-config") return selection;
        if (selection.status === "project") {
          return selection;
        }
        excluded ??= selection;
      }
      if (directory === workspaceRoot) break;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  } finally {
    api.close();
  }
  return (
    excluded ?? {
      status: "no-config",
      message: `No tsconfig.json found for ${entry} within ${workspaceRoot}.`,
      workspaceRoot,
      paths: {},
    }
  );
}

/** Loads only reachable shader sources and returns the core virtual-map contract. */
export async function loadShaderGraph(
  options: LoadShaderGraphOptions,
): Promise<LoadedShaderGraph> {
  const entry = canonicalMaybe(options.entry);
  const project = selectProject(entry, options.searchRoots);
  const files = new Map<string, string>();
  const readSource =
    options.readSource ?? ((fileName: string) => readFile(fileName, "utf8"));
  const pending = [entry];

  while (pending.length) {
    const fileName = pending.pop()!;
    if (files.has(fileName)) continue;
    let source: string;
    try {
      source = await readSource(fileName);
    } catch (error) {
      throw new ProjectInputError(
        `Cannot read shader file ${JSON.stringify(fileName)}.`,
        {
          cause: error,
        },
      );
    }
    files.set(fileName, source);
    for (const specifier of sourceSpecifiers(source, fileName)) {
      const dependency = await resolveShaderSpecifier(
        fileName,
        specifier,
        project.paths,
      );
      if (dependency) pending.push(canonicalMaybe(dependency));
    }
  }

  return {
    input: {
      entry,
      files,
      ...(Object.keys(project.paths).length ? { paths: project.paths } : {}),
    },
    project,
  };
}

/** Synchronous counterpart for editor/LSP notification handlers. */
export function loadShaderGraphSync(
  options: LoadShaderGraphSyncOptions,
): LoadedShaderGraph {
  const entry = canonicalMaybe(options.entry);
  const project = selectProject(entry, options.searchRoots);
  const files = new Map<string, string>();
  const readSource =
    options.readSource ??
    ((fileName: string) => readFileSync(fileName, "utf8"));
  const pending = [entry];

  while (pending.length) {
    const fileName = pending.pop()!;
    if (files.has(fileName)) continue;
    let source: string;
    try {
      source = readSource(fileName);
    } catch (error) {
      throw new ProjectInputError(
        `Cannot read shader file ${JSON.stringify(fileName)}.`,
        { cause: error },
      );
    }
    files.set(fileName, source);
    for (const specifier of sourceSpecifiers(source, fileName)) {
      const dependency = resolveShaderSpecifierSync(
        fileName,
        specifier,
        project.paths,
      );
      if (dependency) pending.push(canonicalMaybe(dependency));
    }
  }

  return {
    input: {
      entry,
      files,
      ...(Object.keys(project.paths).length ? { paths: project.paths } : {}),
    },
    project,
  };
}

function inspectConfig(
  api: API,
  configFile: string,
  entry: string,
  workspaceRoot: string,
): ProjectSelection {
  const canonicalConfig = canonicalMaybe(configFile);
  let snapshot;
  try {
    snapshot = api.updateSnapshot({
      openProjects: [canonicalConfig],
      fileChanges: { changed: [canonicalConfig] },
    });
    const project = snapshot.getProject(canonicalConfig);
    if (!project) throw new Error("TypeScript project was not loaded.");
    const errors = project.program.getConfigFileParsingDiagnostics();
    if (errors.length) {
      return {
        status: "invalid-config",
        configPath: canonicalConfig,
        workspaceRoot,
        paths: {},
        message: `Invalid tsconfig.json at ${canonicalConfig}: ${errors.map((error) => error.text).join(" ")}`,
      };
    }
    const paths = effectivePaths(project, canonicalConfig);
    if (!project.rootFiles.some((fileName) => sameFile(fileName, entry))) {
      return {
        status: "excluded",
        configPath: canonicalConfig,
        workspaceRoot,
        paths: {},
        message: `${entry} is not included in tsconfig.json at ${canonicalConfig}.`,
      };
    }
    return {
      status: "project",
      configPath: canonicalConfig,
      workspaceRoot,
      rootFiles: project.rootFiles,
      paths,
    };
  } catch (error) {
    return {
      status: "invalid-config",
      configPath: canonicalConfig,
      workspaceRoot,
      paths: {},
      message: `Cannot load TypeScript project from tsconfig.json at ${canonicalConfig}: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    snapshot?.dispose();
    api.updateSnapshot({ closeProjects: [canonicalConfig] }).dispose();
  }
}

function effectivePaths(
  project: Project,
  configPath: string,
): Readonly<Record<string, readonly string[]>> {
  const options = project.compilerOptions as typeof project.compilerOptions & {
    readonly pathsBasePath?: string;
  };
  const base = options.pathsBasePath ?? dirname(configPath);
  const paths = options.paths as Record<string, readonly string[]> | undefined;
  if (!paths) return {};
  return Object.fromEntries(
    Object.entries(paths).map(([pattern, targets]) => [
      pattern,
      targets.map((target) =>
        canonicalizePathPattern(resolve(base, target).split(sep).join("/")),
      ),
    ]),
  );
}

function canonicalizePathPattern(target: string): string {
  const wildcard = target.indexOf("*");
  if (wildcard < 0) return canonicalMaybe(target).split(sep).join("/");
  const prefix = target.slice(0, wildcard);
  if (prefix.endsWith("/") || prefix.endsWith("\\")) {
    const directory = canonicalMaybe(prefix.slice(0, -1));
    return `${directory}/${target.slice(wildcard)}`.split(sep).join("/");
  }
  const directory = dirname(prefix);
  const remainder = prefix.slice(directory.length).replace(/^[/\\\\]/, "");
  const canonicalDirectory = canonicalMaybe(directory);
  const canonicalPrefix = remainder
    ? join(canonicalDirectory, remainder)
    : canonicalDirectory;
  const trimmedPrefix = canonicalPrefix.replace(/[/\\\\]+$/, "") || "/";
  const separator =
    (prefix.endsWith("/") || prefix.endsWith("\\")) && trimmedPrefix !== "/"
      ? "/"
      : "";
  return `${trimmedPrefix}${separator}${target.slice(wildcard)}`
    .split(sep)
    .join("/");
}

function sourceSpecifiers(source: string, fileName: string): readonly string[] {
  let file;
  try {
    file = parse(source, {
      errorRecovery: true,
      plugins: ["typescript"],
      sourceFilename: fileName,
      sourceType: "module",
    });
  } catch {
    return [];
  }
  return file.program.body.flatMap((statement) => {
    if (
      statement.type !== "ImportDeclaration" ||
      statement.source.value === "shdr" ||
      statement.importKind === "type"
    )
      return [];
    return statement.specifiers.some(
      (specifier) =>
        specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
    )
      ? [statement.source.value]
      : [];
  });
}

function resolveShaderSpecifierSync(
  importer: string,
  specifier: string,
  paths: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const candidate = specifier.endsWith(".shdr.ts")
      ? resolve(dirname(importer), specifier)
      : undefined;
    return candidate && isFileSync(candidate) ? candidate : undefined;
  }
  const mappings = Object.entries(paths).filter(([pattern]) =>
    matches(pattern, specifier),
  );
  const exact = mappings.find(([pattern]) => !pattern.includes("*"));
  const selected =
    exact ??
    [...mappings].sort(
      ([left], [right]) => wildcardPrefix(right) - wildcardPrefix(left),
    )[0];
  if (!selected) return undefined;
  const [pattern, targets] = selected;
  const star = wildcardValue(pattern, specifier);
  for (const target of targets) {
    const substituted = target.includes("*")
      ? target.replace("*", star ?? "")
      : target;
    if (substituted.endsWith(".shdr.ts") && isFileSync(substituted))
      return substituted;
  }
  return undefined;
}

async function resolveShaderSpecifier(
  importer: string,
  specifier: string,
  paths: Readonly<Record<string, readonly string[]>>,
): Promise<string | undefined> {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const candidate = specifier.endsWith(".shdr.ts")
      ? resolve(dirname(importer), specifier)
      : undefined;
    return candidate && (await isFile(candidate)) ? candidate : undefined;
  }
  const mappings = Object.entries(paths).filter(([pattern]) =>
    matches(pattern, specifier),
  );
  const exact = mappings.find(([pattern]) => !pattern.includes("*"));
  const selected =
    exact ??
    [...mappings].sort(
      ([left], [right]) => wildcardPrefix(right) - wildcardPrefix(left),
    )[0];
  if (!selected) return undefined;
  const [pattern, targets] = selected;
  const star = wildcardValue(pattern, specifier);
  for (const target of targets) {
    const substituted = target.includes("*")
      ? target.replace("*", star ?? "")
      : target;
    if (substituted.endsWith(".shdr.ts") && (await isFile(substituted)))
      return substituted;
  }
  return undefined;
}

function matches(pattern: string, source: string): boolean {
  if (!pattern.includes("*")) return pattern === source;
  const [prefix, suffix] = pattern.split("*") as [string, string];
  return source.startsWith(prefix) && source.endsWith(suffix);
}

function wildcardPrefix(pattern: string): number {
  const index = pattern.indexOf("*");
  return index < 0 ? pattern.length : index;
}

function wildcardValue(pattern: string, source: string): string | undefined {
  const index = pattern.indexOf("*");
  if (index < 0) return undefined;
  const suffix = pattern.slice(index + 1);
  return source.slice(index, source.length - suffix.length);
}

function uniqueCanonicalDirectories(
  paths: readonly string[],
): readonly string[] {
  const values = paths.length ? paths : [process.cwd()];
  return [...new Set(values.map(canonicalMaybe))].filter((path) =>
    isDirectorySync(path),
  );
}

function deepestContaining(
  roots: readonly string[],
  fileName: string,
): string | undefined {
  return [...roots]
    .filter((root) => contains(root, fileName))
    .sort((left, right) => right.length - left.length)[0];
}

function canonicalMaybe(fileName: string): string {
  try {
    return realpathSync(fileName);
  } catch {
    return resolve(fileName);
  }
}

function isFileSync(fileName: string): boolean {
  try {
    return statSync(fileName).isFile();
  } catch {
    return false;
  }
}

function isDirectorySync(fileName: string): boolean {
  try {
    return statSync(fileName).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(fileName: string): Promise<boolean> {
  try {
    return (await stat(fileName)).isFile();
  } catch {
    return false;
  }
}

function contains(root: string, fileName: string): boolean {
  const path = relative(root, fileName);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function sameFile(left: string, right: string): boolean {
  return canonicalMaybe(left) === right;
}

import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { compileFragmentArtifact } from "@shdr/core/browser";
import type { ShaderDiagnostic } from "@shdr/core";
import { loadShaderGraph, ProjectInputError } from "@shdr/project";
import type { HmrContext, ModuleNode, Plugin, ResolvedConfig } from "vite";

export type VitePackage = "@shdr/vite";
export const vitePackageName: VitePackage = "@shdr/vite";

/** Creates the pre-transform that compiles `.shdr.ts` modules to dual-target artifacts. */
export function shdr(): Plugin {
  let projectRoot = process.cwd();
  const entryDependencies = new Map<string, ReadonlySet<string>>();
  const dependencyEntries = new Map<string, Set<string>>();

  return {
    name: "shdr",
    enforce: "pre",
    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },
    async transform(source, id) {
      const fileName = stripViteQuery(id);
      if (!fileName.endsWith(".shdr.ts")) return null;

      const entry = await canonicalFileName(fileName);
      let loaded;
      try {
        loaded = await loadShaderGraph({
          entry,
          searchRoots: [projectRoot],
          readSource: async (requested) =>
            requested === entry ? source : readFile(requested, "utf8"),
        });
      } catch (error) {
        this.error({
          name: "ShdrProjectError",
          message:
            error instanceof ProjectInputError
              ? error.message
              : error instanceof Error
                ? error.message
                : String(error),
          id: fileName,
        });
      }

      const fileNames =
        loaded.input.files instanceof Map
          ? [...loaded.input.files.keys()]
          : Object.keys(loaded.input.files);
      const dependencies = new Set(
        fileNames.filter((dependency) => dependency !== entry),
      );
      replaceEntryDependencies(
        entry,
        dependencies,
        entryDependencies,
        dependencyEntries,
      );
      for (const dependency of dependencies) this.addWatchFile(dependency);

      const compiled = compileFragmentArtifact(loaded.input);
      if (!compiled.ok) {
        const primary = compiled.diagnostics[0];
        if (!primary) {
          throw new Error("Shader compilation failed without a diagnostic.");
        }
        const diagnosticSource =
          loaded.input.files instanceof Map
            ? loaded.input.files.get(
                "fileName" in primary ? primary.fileName : entry,
              )
            : undefined;
        const sourceForLocation = diagnosticSource ?? source;
        const diagnosticFile =
          "fileName" in primary ? primary.fileName : fileName;

        this.error({
          name: "ShdrCompileError",
          message: formatDiagnostics(compiled.diagnostics),
          id: diagnosticFile,
          loc: {
            file: diagnosticFile,
            ...offsetToLocation(sourceForLocation, primary.range.start),
          },
          pluginCode: primary.code,
        });
      }

      return {
        code: `export default ${JSON.stringify(compiled.artifact)};\n`,
        map: null,
      };
    },
    async handleHotUpdate(context: HmrContext) {
      const fileName = await canonicalFileName(context.file);
      const entries = dependencyEntries.get(fileName);
      if (!entries?.size) return;
      const modules = new Set<ModuleNode>(context.modules);
      for (const entry of entries) {
        const module = context.server.moduleGraph.getModuleById(entry);
        if (module) modules.add(module);
      }
      return [...modules];
    },
  };
}

function replaceEntryDependencies(
  entry: string,
  dependencies: ReadonlySet<string>,
  entryDependencies: Map<string, ReadonlySet<string>>,
  dependencyEntries: Map<string, Set<string>>,
): void {
  for (const dependency of entryDependencies.get(entry) ?? []) {
    const entries = dependencyEntries.get(dependency);
    entries?.delete(entry);
    if (entries?.size === 0) dependencyEntries.delete(dependency);
  }
  entryDependencies.set(entry, dependencies);
  for (const dependency of dependencies) {
    let entries = dependencyEntries.get(dependency);
    if (!entries) {
      entries = new Set();
      dependencyEntries.set(dependency, entries);
    }
    entries.add(entry);
  }
}

async function canonicalFileName(fileName: string): Promise<string> {
  try {
    return await realpath(fileName);
  } catch {
    return resolve(fileName);
  }
}

export default shdr;

function stripViteQuery(id: string): string {
  const suffixStart = id.search(/[?#]/);
  return suffixStart < 0 ? id : id.slice(0, suffixStart);
}

function formatDiagnostics(diagnostics: readonly ShaderDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("\n");
}

function offsetToLocation(
  source: string,
  requestedOffset: number,
): { readonly line: number; readonly column: number } {
  const offset = Math.min(Math.max(requestedOffset, 0), source.length);
  let line = 1;
  let column = 0;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

import {
  compileFragment,
  type CorePackage,
  type ShaderDiagnostic,
} from "@shdr/core";
import type { Plugin } from "vite";

export type VitePackage = "@shdr/vite";
export type ViteWorkspaceSmoke = CorePackage;
export const vitePackageName: VitePackage = "@shdr/vite";

/** Creates the pre-transform that compiles `.shdr.ts` modules to GLSL strings. */
export function shdr(): Plugin {
  return {
    name: "shdr",
    enforce: "pre",
    transform(source, id) {
      const fileName = stripViteQuery(id);
      if (!fileName.endsWith(".shdr.ts")) return null;

      const compiled = compileFragment(source, { target: "glsl-es-300" });
      if (!compiled.ok) {
        const primary = compiled.diagnostics[0];
        if (!primary) {
          throw new Error("Shader compilation failed without a diagnostic.");
        }

        this.error({
          name: "ShdrCompileError",
          message: formatDiagnostics(compiled.diagnostics),
          id: fileName,
          loc: {
            file: fileName,
            ...offsetToLocation(source, primary.range.start),
          },
          pluginCode: primary.code,
        });
      }

      return {
        code: `export default ${JSON.stringify(compiled.code)};\n`,
        map: null,
      };
    },
  };
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

import { useCallback, useEffect, useState } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import {
  compileShdrBody,
  type CompileShdrDiagnostic,
} from "../compiler/compile-shdr-body";
import { initialShaderSource } from "../shared/initial-source";
import { toShaderUniformDefinitions } from "../components/uniforms-pane/definitions";
import { getDraftState } from "../stores/draft";
import { cloneUniforms, type Uniform } from "../shared/uniforms";

type Compilation = {
  artifact: CompiledFragmentArtifact | null;
  error: string | null;
};

type Sources = {
  main: string;
  utils: string;
};

function sourceLocation(
  source: string,
  range: { readonly start: number },
): string {
  const position = Math.max(0, Math.min(range.start, source.length));
  const before = source.slice(0, position);
  const line = before.split("\n").length;
  const column = position - before.lastIndexOf("\n");
  return `Line ${line}, column ${column}`;
}

function formatCompileError(
  sources: Sources,
  diagnostics: readonly CompileShdrDiagnostic[],
): string {
  return diagnostics
    .map((diagnostic) => {
      const document = diagnostic.document;
      const source = document === "uniforms" ? "" : sources[document];
      const label =
        document === "main"
          ? "Main"
          : document === "utils"
            ? "Utils"
            : "Uniforms";
      const location = `${label}: ${sourceLocation(source, diagnostic.range)}: `;
      return `${location}${diagnostic.code}: ${diagnostic.message}`;
    })
    .join("\n");
}

function compileSource(
  sources: Sources,
  uniforms: readonly Uniform[],
): Compilation {
  const converted = toShaderUniformDefinitions(uniforms);
  if (!converted.ok) return { artifact: null, error: converted.error };

  try {
    const result = compileShdrBody(
      sources.main,
      sources.utils,
      converted.definitions,
    );
    if (!result.ok) {
      return {
        artifact: null,
        error: formatCompileError(sources, result.diagnostics),
      };
    }
    return { artifact: result.artifact, error: null };
  } catch (error) {
    return { artifact: null, error: formatRuntimeError(error) };
  }
}

function formatRuntimeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const initialSources: Sources = { main: initialShaderSource, utils: "" };
const initialCompilation = compileSource(initialSources, []);

export interface UseShdrCompilationResult {
  artifact: CompiledFragmentArtifact | null;
  /** Uniforms from the last successful apply, never the editor draft. */
  appliedUniforms: readonly Uniform[];
  compileError: string | null;
  runtimeError: string | null;
  onPreviewError: (error: unknown) => void;
  apply: () => void;
}

/** Applies the latest store draft only on an explicit manual shader apply. */
export function useShdrCompilation(): UseShdrCompilationResult {
  const [artifact, setArtifact] = useState<CompiledFragmentArtifact | null>(
    initialCompilation.artifact,
  );
  const [compileError, setCompileError] = useState<string | null>(
    initialCompilation.error,
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [appliedUniforms, setAppliedUniforms] = useState<readonly Uniform[]>(
    [],
  );

  const apply = useCallback(() => {
    const draft = getDraftState();
    const sources: Sources = { main: draft.main, utils: draft.utils };
    const uniforms = draft.uniforms;
    const compilation = compileSource(sources, uniforms);
    setCompileError(compilation.error);
    if (!compilation.artifact) return;

    setRuntimeError(null);
    // Copy the successful apply snapshot. Draft edits remain local to the
    // editor and cannot change the working preview controls.
    setAppliedUniforms(cloneUniforms(uniforms));
    setArtifact(compilation.artifact);
  }, []);

  const onPreviewError = useCallback((error: unknown) => {
    setRuntimeError(formatRuntimeError(error));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Enter" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      apply();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [apply]);

  return {
    artifact,
    appliedUniforms,
    compileError,
    runtimeError,
    onPreviewError,
    apply,
  };
}

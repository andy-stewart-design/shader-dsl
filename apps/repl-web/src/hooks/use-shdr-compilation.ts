import { useCallback, useEffect, useRef, useState } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import {
  compileShdrBody,
  type CompileShdrDiagnostic,
  type ShaderDocument,
} from "../compiler/compile-shdr-body";
import { initialShaderSource } from "../shared/initial-source";

type Compilation = {
  artifact: CompiledFragmentArtifact | null;
  error: string | null;
};

type Draft = {
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
  sources: Draft,
  diagnostics: readonly CompileShdrDiagnostic[],
): string {
  return diagnostics
    .map((diagnostic) => {
      const document = diagnostic.document;
      const source = sources[document];
      const location = `${document === "main" ? "Main" : "Utils"}: ${sourceLocation(source, diagnostic.range)}: `;
      return `${location}${diagnostic.code}: ${diagnostic.message}`;
    })
    .join("\n");
}

function compileSource(sources: Draft): Compilation {
  try {
    const result = compileShdrBody(sources.main, sources.utils);
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

const initialSources: Draft = { main: initialShaderSource, utils: "" };
const initialCompilation = compileSource(initialSources);

export interface UseShdrCompilationResult {
  artifact: CompiledFragmentArtifact | null;
  compileError: string | null;
  runtimeError: string | null;
  onChange: (document: ShaderDocument, source: string) => void;
  onPreviewError: (error: unknown) => void;
  apply: () => void;
}

/** Keeps editor drafts local until an explicit manual shader apply. */
export function useShdrCompilation(): UseShdrCompilationResult {
  const draftRef = useRef<Draft>({ ...initialSources });
  const [artifact, setArtifact] = useState<CompiledFragmentArtifact | null>(
    initialCompilation.artifact,
  );
  const [compileError, setCompileError] = useState<string | null>(
    initialCompilation.error,
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const onChange = useCallback((document: ShaderDocument, source: string) => {
    draftRef.current[document] = source;
  }, []);

  const apply = useCallback(() => {
    const compilation = compileSource({ ...draftRef.current });
    setCompileError(compilation.error);
    if (!compilation.artifact) return;

    setRuntimeError(null);
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
    compileError,
    runtimeError,
    onChange,
    onPreviewError,
    apply,
  };
}

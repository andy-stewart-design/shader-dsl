import type { CompileArtifactFailure } from "@shdr/core/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import { compileShdrBody } from "../compiler/compile-shdr-body";
import { initialShaderSource } from "../shared/initial-source";

type Compilation = {
  artifact: CompiledFragmentArtifact | null;
  error: string | null;
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
  source: string,
  diagnostics: CompileArtifactFailure["diagnostics"],
): string {
  return diagnostics
    .map((diagnostic) => {
      const location = `${sourceLocation(source, diagnostic.range)}: `;
      return `${location}${diagnostic.code}: ${diagnostic.message}`;
    })
    .join("\n");
}

function compileSource(source: string): Compilation {
  try {
    const result = compileShdrBody(source);
    if (!result.ok) {
      return {
        artifact: null,
        error: formatCompileError(source, result.diagnostics),
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

const initialCompilation = compileSource(initialShaderSource);

export interface UseShdrCompilationResult {
  artifact: CompiledFragmentArtifact | null;
  compileError: string | null;
  runtimeError: string | null;
  onChange: (source: string) => void;
  onPreviewError: (error: unknown) => void;
  apply: () => void;
}

/** Keeps editor drafts local until an explicit manual shader apply. */
export function useShdrCompilation(): UseShdrCompilationResult {
  const draftRef = useRef(initialShaderSource);
  const [artifact, setArtifact] = useState<CompiledFragmentArtifact | null>(
    initialCompilation.artifact,
  );
  const [compileError, setCompileError] = useState<string | null>(
    initialCompilation.error,
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const onChange = useCallback((source: string) => {
    draftRef.current = source;
  }, []);

  const apply = useCallback(() => {
    const compilation = compileSource(draftRef.current);
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

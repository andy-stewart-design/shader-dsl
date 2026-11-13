import { useCallback, useEffect, useState } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import {
  createApplyController,
  updateApplyErrorPresentation,
  type ApplyCompileResult,
  type ApplyController,
  type ApplyDiagnostic,
  type ApplyErrorPresentation,
  type ApplyPreviewPort,
  type ApplyState,
} from "../agent/apply-controller.ts";
import { compileShdrBody, type CompileShdrDiagnostic } from "../compiler/compile-shdr-body";
import { initialShaderSource } from "../shared/initial-source";
import { toShaderUniformDefinitions } from "../components/uniforms-pane/definitions";
import { getDraftState } from "../stores/draft";
import { cloneUniforms, type Uniform } from "../shared/uniforms";
import type { DraftSnapshot } from "../agent/authoring-controller.ts";
import { readUniformDefinitions, type UniformDefinitionInput } from "../agent/authoring-schema.ts";

interface Sources {
  main: string;
  utils: string;
}

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

export function formatCompileDiagnostics(
  sources: Sources,
  diagnostics: readonly CompileShdrDiagnostic[],
): string {
  return diagnostics
    .map((diagnostic) => {
      const document = diagnostic.document;
      const source = document === "uniforms" ? "" : sources[document];
      const label = document === "main" ? "Main" : document === "utils" ? "Utils" : "Uniforms";
      return `${label}: ${sourceLocation(source, diagnostic.range)}: ${diagnostic.code}: ${diagnostic.message}`;
    })
    .join("\n");
}

function toDraftUniforms(inputs: readonly UniformDefinitionInput[]): Uniform[] {
  return inputs.map((uniform, index) =>
    uniform.type === "float"
      ? { id: uniform.id ?? `uniform-${index}`, name: uniform.name, type: "float", value: uniform.value, min: uniform.min, max: uniform.max }
      : { id: uniform.id ?? `uniform-${index}`, name: uniform.name, type: "color", draft: uniform.value, valid: uniform.value },
  );
}

function compileSnapshot(snapshot: DraftSnapshot): ApplyCompileResult {
  const converted = toShaderUniformDefinitions(toDraftUniforms(snapshot.uniforms));
  if (!converted.ok) {
    return {
      ok: false,
      diagnostics: [{ code: "uniform", message: converted.error, document: "uniforms" }],
    };
  }
  const result = compileShdrBody(snapshot.main, snapshot.utils, converted.definitions);
  if (!result.ok) {
    return {
      ok: false,
      diagnostics: result.diagnostics.map((diagnostic) => ({
        code: diagnosticCode(diagnostic),
        message: diagnostic.message,
        document: diagnostic.document,
        range: diagnostic.range,
      })),
    };
  }
  return { ok: true, artifact: result.artifact };
}

export function compileDraftSnapshot(snapshot: DraftSnapshot): ApplyCompileResult {
  try {
    return compileSnapshot(snapshot);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{ code: "syntax", message: error instanceof Error ? error.message : String(error) }],
    };
  }
}

function diagnosticCode(diagnostic: CompileShdrDiagnostic): ApplyDiagnostic["code"] {
  const text = `${diagnostic.code} ${diagnostic.message}`.toLowerCase();
  return text.includes("type") ? "type" : "syntax";
}

const initialSnapshot: DraftSnapshot = {
  revision: 0,
  main: initialShaderSource,
  utils: "",
  uniforms: [],
};
const initialCompilation = compileDraftSnapshot(initialSnapshot);

export interface UseShdrCompilationResult {
  artifact: CompiledFragmentArtifact | null;
  appliedUniforms: readonly Uniform[];
  compileError: string | null;
  runtimeError: string | null;
  applyState: ApplyState;
  applyController: ApplyController;
  applyPortRef: { current: ApplyPreviewPort | null };
  onInitialFrame: (info: { readonly backend: "webgpu" | "webgl"; readonly artifact: CompiledFragmentArtifact }) => void;
  isEvaluationFlashing: boolean;
  onPreviewError: (error: unknown) => void;
  apply: () => void;
}

/** Manual Run and agent Apply share this awaitable compile/install/draw pipeline. */
export function useShdrCompilation(): UseShdrCompilationResult {
  const [artifact, setArtifact] = useState<CompiledFragmentArtifact | null>(
    initialCompilation.ok ? initialCompilation.artifact : null,
  );
  const [errorPresentation, setErrorPresentation] = useState<ApplyErrorPresentation>({
    compileError: initialCompilation.ok
      ? null
      : initialCompilation.diagnostics.map((item) => item.message).join("\n"),
    runtimeError: null,
  });
  const [appliedUniforms, setAppliedUniforms] = useState<readonly Uniform[]>([]);
  const [isEvaluationFlashing, setIsEvaluationFlashing] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState>({
    phase: "idle",
    attemptId: 0,
    appliedRevision: null,
    diagnostics: [],
  });
  const [applyPortRef] = useState<{ current: ApplyPreviewPort | null }>(() => ({ current: null }));
  const [artifactRevision] = useState(() => ({ value: 0 }));
  const [controller] = useState<ApplyController>(() => createApplyController({
      readDraft: () => {
        const draft = getDraftState();
        return {
          revision: draft.revision,
          main: draft.main,
          utils: draft.utils,
          uniforms: readUniformDefinitions(draft.uniforms),
        };
      },
      compile: compileDraftSnapshot,
      preview: applyPortRef,
      onApplied: (snapshot, nextArtifact) => {
        artifactRevision.value = snapshot.revision;
        setArtifact(nextArtifact);
        setAppliedUniforms(cloneUniforms(toDraftUniforms(snapshot.uniforms)));
      },
  }));

  useEffect(() => controller.subscribe(() => {
    const next = controller.getState();
    setApplyState(next);
    setErrorPresentation((previous) => updateApplyErrorPresentation(previous, next));
  }), [controller]);

  const apply = useCallback(() => {
    const expectedRevision = getDraftState().revision;
    setIsEvaluationFlashing(true);
    void controller.apply({ expectedRevision }).then(() => {
      setIsEvaluationFlashing(false);
    });
  }, [controller]);

  const onPreviewError = useCallback((error: unknown) => {
    setErrorPresentation((previous) => ({
      ...previous,
      runtimeError: error instanceof Error ? error.message : String(error),
    }));
  }, []);
  const onInitialFrame = useCallback(
    (info: { readonly backend: "webgpu" | "webgl"; readonly artifact: CompiledFragmentArtifact }) => {
      controller.confirmInitial(artifactRevision.value, info.backend);
    },
    [artifactRevision, controller],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing || event.keyCode === 229) return;
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
    compileError: errorPresentation.compileError,
    runtimeError: errorPresentation.runtimeError,
    applyState,
    applyController: controller,
    applyPortRef,
    onInitialFrame,
    isEvaluationFlashing,
    onPreviewError,
    apply,
  };
}

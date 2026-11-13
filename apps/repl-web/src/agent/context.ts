import { SHADER_BUILTINS } from "@shdr/core/browser";
import type { DraftSnapshot } from "./authoring-controller.ts";
import type { AuthoringController } from "./controller-types.ts";
import type { ApplyState } from "./apply-controller.ts";

/** The language surface actually imported by the REPL compiler. */
const LANGUAGE = {
  documents: {
    main: "Shader body passed to createFragmentShader.",
    utils: "Helper declarations placed before the main shader body.",
  },
  composition:
    "The REPL generates shdr imports, optional uniform definitions, utils, and a createFragmentShader callback containing main.",
  valueTypes: [
    "f32",
    "vec2",
    "vec3",
    "vec4",
    "mat2",
    "mat3",
    "mat4",
  ],
  builtins: Object.keys(SHADER_BUILTINS),
  constructors: ["vec2", "vec3", "vec4", "mat2", "mat3", "mat4"],
  additionalCallables: ["sample"],
  implicitValues: ["coord", "uniforms", "u"],
} as const;

export interface AuthoringContext {
  readonly toolScope: "authoring-read-update-preview";
  readonly language: typeof LANGUAGE;
  readonly uniforms: {
    readonly editableFields: readonly string[];
    readonly definitionShapes: {
      readonly float: readonly string[];
      readonly color: readonly string[];
    };
    readonly definitions: DraftSnapshot["uniforms"];
    readonly runtimeValuesExposed: false;
  };
  readonly workflow: {
    readonly apply: "explicit-manual-run" | "explicit-manual-run-or-apply-sketch";
    readonly runShortcut: "Alt+Enter";
    readonly sourceEditsCompile: "only-after-human-run" | "only-after-explicit-apply";
    readonly manualRuntimeControls: "unchanged-and-not-exposed";
  };
  readonly draftRevision: number;
  readonly preview: {
    readonly status: ApplyState["phase"] | "not-tracked-before-phase-4";
    readonly appliedRevision: number | null;
    readonly capture: "capture_preview" | "not-registered";
    readonly captureDefaultMaxDimension: 512;
    readonly captureNativeOption: "maxDimension: 'native'";
    readonly attemptId?: number;
    readonly draftRevision?: number;
    readonly backend?: "webgpu" | "webgl";
    readonly diagnostics?: ApplyState["diagnostics"];
    readonly note: string;
  };
}

export function createAuthoringContext(
  controller: AuthoringController,
  captureRegistered = false,
): AuthoringContext {
  const snapshot = controller.read();
  const apply = controller.getApplyState?.();
  return {
    toolScope: "authoring-read-update-preview",
    language: LANGUAGE,
    uniforms: {
      editableFields: ["id", "name", "type", "value", "min", "max"],
      definitionShapes: {
        float: ["id", "name", "type", "value", "min", "max"],
        color: ["id", "name", "type", "value"],
      },
      definitions: snapshot.uniforms,
      runtimeValuesExposed: false,
    },
    workflow: {
      apply: controller.apply
        ? "explicit-manual-run-or-apply-sketch"
        : "explicit-manual-run",
      runShortcut: "Alt+Enter",
      sourceEditsCompile: controller.apply
        ? "only-after-explicit-apply"
        : "only-after-human-run",
      manualRuntimeControls: "unchanged-and-not-exposed",
    },
    draftRevision: snapshot.revision,
    preview: {
      ...previewFromApplyState(apply),
      capture: captureRegistered ? "capture_preview" : "not-registered",
      captureDefaultMaxDimension: 512,
      captureNativeOption: "maxDimension: 'native'",
    },
  };
}

export function sketchFromSnapshot(
  snapshot: DraftSnapshot,
  apply?: ApplyState,
) {
  return {
    revision: snapshot.revision,
    main: snapshot.main,
    utils: snapshot.utils,
    uniforms: snapshot.uniforms,
    preview: previewFromApplyState(apply),
  };
}

function previewFromApplyState(apply?: ApplyState) {
  if (!apply) {
    return {
      status: "not-tracked-before-phase-4" as const,
      appliedRevision: null,
      note: "The current draft may differ from the last manually run preview.",
    };
  }
  return {
    status: apply.phase,
    appliedRevision: apply.appliedRevision,
    attemptId: apply.attemptId,
    ...(apply.draftRevision === undefined ? {} : { draftRevision: apply.draftRevision }),
    ...(apply.appliedBackend ? { backend: apply.appliedBackend } : {}),
    diagnostics: apply.diagnostics,
    note:
      apply.phase === "applied"
        ? "Applied identity is reported only after renderer installation and first-frame completion."
        : "The draft and last confirmed applied revision are tracked separately.",
  };
}

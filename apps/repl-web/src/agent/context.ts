import { SHADER_BUILTINS } from "@shdr/core/browser";
import type { DraftSnapshot } from "./authoring-controller.ts";
import type { AuthoringController } from "./controller-types.ts";

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
  readonly toolScope: "authoring-read-update-only";
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
    readonly apply: "explicit-manual-run";
    readonly runShortcut: "Alt+Enter";
    readonly sourceEditsCompile: "only-after-human-run";
    readonly manualRuntimeControls: "unchanged-and-not-exposed";
  };
  readonly draftRevision: number;
  readonly preview: {
    readonly status: "not-tracked-before-phase-4";
    readonly appliedRevision: null;
    readonly note: string;
  };
}

export function createAuthoringContext(
  controller: AuthoringController,
): AuthoringContext {
  const snapshot = controller.read();
  return {
    toolScope: "authoring-read-update-only",
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
      apply: "explicit-manual-run",
      runShortcut: "Alt+Enter",
      sourceEditsCompile: "only-after-human-run",
      manualRuntimeControls: "unchanged-and-not-exposed",
    },
    draftRevision: snapshot.revision,
    preview: {
      status: "not-tracked-before-phase-4",
      appliedRevision: null,
      note: "This phase does not track or claim which draft revision is rendered.",
    },
  };
}

export function sketchFromSnapshot(snapshot: DraftSnapshot) {
  return {
    revision: snapshot.revision,
    main: snapshot.main,
    utils: snapshot.utils,
    uniforms: snapshot.uniforms,
    preview: {
      status: "not-tracked-before-phase-4" as const,
      appliedRevision: null,
      note: "The current draft may differ from the last manually run preview.",
    },
  };
}

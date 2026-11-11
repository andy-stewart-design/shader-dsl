import {
  authoringUpdateJsonSchema,
  normalizeUniformDefinitions,
  readUniformDefinitions,
  type AuthoringUpdateInput,
} from "./authoring-schema.ts";
import {
  useDraftStore,
  type DraftState,
  type DraftStore,
} from "../stores/draft.ts";
import type { Uniform } from "../shared/uniforms.ts";

export { authoringUpdateJsonSchema };

export interface DraftSnapshot {
  readonly revision: number;
  readonly main: string;
  readonly utils: string;
  readonly uniforms: ReturnType<typeof readUniformDefinitions>;
}

export type AuthoringUpdateResult =
  | { readonly ok: true; readonly snapshot: DraftSnapshot }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "conflict" | "validation";
        readonly message: string;
        readonly currentRevision?: number;
      };
    };

const UPDATE_KEYS = new Set(["expectedRevision", "main", "utils", "uniforms"]);

/**
 * Synchronous, store-local authoring boundary. It is intentionally not
 * registered with a transport or exposed on window; later phases can adapt
 * this boundary once editor transactions are ready.
 */
export function createAuthoringController(store: DraftStore = useDraftStore) {
  return {
    read(): DraftSnapshot {
      return snapshot(store.getState());
    },

    update(request: unknown): AuthoringUpdateResult {
      const state = store.getState();
      const shapeError = validateRequestShape(request);
      if (shapeError) return validationFailure(shapeError);

      const input = request as AuthoringUpdateInput;
      if (input.expectedRevision !== state.revision) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: `Expected draft revision ${input.expectedRevision}, but current revision is ${state.revision}.`,
            currentRevision: state.revision,
          },
        };
      }

      const changes: {
        main?: string;
        utils?: string;
        uniforms?: Uniform[];
      } = {};

      if (Object.hasOwn(input, "main")) changes.main = input.main;
      if (Object.hasOwn(input, "utils")) changes.utils = input.utils;
      if (Object.hasOwn(input, "uniforms")) {
        const normalized = normalizeUniformDefinitions(
          input.uniforms,
          state.uniforms,
        );
        if (!normalized.ok) return validationFailure(normalized.error);
        changes.uniforms = normalized.uniforms;
      }

      store.getState().actions.commit(changes);
      return { ok: true, snapshot: snapshot(store.getState()) };
    },
  };
}

function validateRequestShape(request: unknown): string | null {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    return "Authoring update must be an object.";
  }
  const input = request as Record<string, unknown>;
  if (!Object.hasOwn(input, "expectedRevision")) {
    return "expectedRevision is required.";
  }
  if (
    typeof input.expectedRevision !== "number" ||
    !Number.isFinite(input.expectedRevision) ||
    !Number.isInteger(input.expectedRevision)
  ) {
    return "expectedRevision must be a finite integer.";
  }
  if (!Object.keys(input).every((key) => UPDATE_KEYS.has(key))) {
    return "Authoring update contains an unknown field.";
  }

  const fields = ["main", "utils", "uniforms"].filter((key) =>
    Object.hasOwn(input, key),
  );
  if (fields.length === 0) return "At least one authoring field is required.";
  if (Object.hasOwn(input, "main") && typeof input.main !== "string") {
    return "main must be a full source string.";
  }
  if (Object.hasOwn(input, "utils") && typeof input.utils !== "string") {
    return "utils must be a full source string.";
  }
  if (Object.hasOwn(input, "uniforms") && !Array.isArray(input.uniforms)) {
    return "uniforms must be a complete replacement list.";
  }
  return null;
}

function snapshot(state: DraftState): DraftSnapshot {
  return {
    revision: state.revision,
    main: state.main,
    utils: state.utils,
    uniforms: readUniformDefinitions(state.uniforms),
  };
}

function validationFailure(message: string): AuthoringUpdateResult {
  return { ok: false, error: { code: "validation", message } };
}

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
import type { EditorRegistry, EditorReplacement } from "../editor/authoring-adapter.ts";
import type { Uniform } from "../shared/uniforms.ts";

export { authoringUpdateJsonSchema };

export interface DraftSnapshot {
  readonly revision: number;
  readonly main: string;
  readonly utils: string;
  readonly uniforms: ReturnType<typeof readUniformDefinitions>;
}

export interface AuthoringControllerOptions {
  /** Optional visible-editor boundary. Omit it for isolated store tests. */
  readonly editorRegistry?: EditorRegistry;
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
 * Synchronous authoring boundary. Without a registry it remains a store-only
 * seam for isolated tests; with one, requested source fields are dispatched to
 * the mounted CodeMirror documents before one coherent draft commit. It is
 * The controller itself has no window surface; the app provider supplies the
 * generic bridge registration separately.
 */
export function createAuthoringController(
  store: DraftStore = useDraftStore,
  options: AuthoringControllerOptions = {},
) {
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
      const replacements: EditorReplacement[] = [];

      // Validate the complete semantic payload before even staging an editor
      // transaction. Staging is pure, but keeping this ordering makes the
      // no-mutation guarantee explicit for invalid multi-field requests.
      if (Object.hasOwn(input, "uniforms")) {
        const normalized = normalizeUniformDefinitions(
          input.uniforms,
          state.uniforms,
        );
        if (!normalized.ok) return validationFailure(normalized.error);
        changes.uniforms = normalized.uniforms;
      }
      if (Object.hasOwn(input, "main")) {
        changes.main = input.main;
        const error = prepareEditorReplacement(
          options.editorRegistry,
          "main",
          state.main,
          input.main!,
          replacements,
        );
        if (error) return validationFailure(error);
      }
      if (Object.hasOwn(input, "utils")) {
        changes.utils = input.utils;
        const error = prepareEditorReplacement(
          options.editorRegistry,
          "utils",
          state.utils,
          input.utils!,
          replacements,
        );
        if (error) return validationFailure(error);
      }

      // All requested ports have now been readied and their transactions have
      // been precomputed. CodeMirror's programmatic annotation prevents the
      // editor callback from becoming an intermediate draft commit; the
      // registry batch also suppresses app-level feedback during this block.
      try {
        const dispatch = () => {
          for (const replacement of replacements) replacement.apply();
        };
        if (options.editorRegistry) options.editorRegistry.batch(dispatch);
        else dispatch();
      } catch (error) {
        // A dispatch can fail after an earlier document was changed. Restore
        // every staged port, including the failing one, before publishing any
        // store state. Store subscriber errors are intentionally not caught.
        for (let index = replacements.length - 1; index >= 0; index -= 1) {
          try {
            replacements[index]!.rollback();
          } catch {
            // The original dispatch error is the useful command result. Real
            // CodeMirror replacements restore their captured EditorState.
          }
        }
        const message =
          error instanceof Error ? error.message : "Editor dispatch failed.";
        return validationFailure(`Editor update failed: ${message}`);
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

function prepareEditorReplacement(
  registry: EditorRegistry | undefined,
  document: "main" | "utils",
  expectedCurrent: string,
  next: string,
  replacements: EditorReplacement[],
): string | null {
  // The controller intentionally retains a store-only seam for unit tests and
  // non-visible consumers. A supplied registry means this is a visible write,
  // so the requested port must participate in the transaction.
  if (!registry) return null;
  const adapter = registry.get(document);
  if (!adapter) return `The ${document} editor is not mounted.`;
  try {
    if (!adapter.isReady()) return `The ${document} editor is not ready.`;
  } catch {
    return `The ${document} editor is not ready.`;
  }
  let current: string;
  try {
    current = adapter.read();
  } catch {
    return `The ${document} editor could not be read.`;
  }
  if (current !== expectedCurrent) {
    return `The ${document} editor is out of sync with the draft.`;
  }
  if (next === current) return null;
  let replacement: EditorReplacement | null;
  try {
    replacement = adapter.prepareReplace(next);
  } catch {
    return `The ${document} editor could not prepare a replacement.`;
  }
  if (!replacement || replacement.current !== current) {
    return `The ${document} editor could not prepare a replacement.`;
  }
  replacements.push(replacement);
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

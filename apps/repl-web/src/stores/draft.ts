import { create } from "zustand";
import { initialShaderSource } from "../shared/initial-source.ts";
import { cloneUniforms, type Uniform } from "../shared/uniforms.ts";

export type DraftDocument = "main" | "utils";

export interface DraftCommit {
  main?: string;
  utils?: string;
  uniforms?: readonly Uniform[];
}

interface DraftActions {
  setSource: (document: DraftDocument, source: string) => void;
  setUniforms: (
    uniforms: Uniform[] | ((current: Uniform[]) => Uniform[]),
  ) => void;
  /** Internal synchronous boundary used by the authoring controller. */
  commit: (changes: DraftCommit) => boolean;
}

export interface DraftState {
  main: string;
  utils: string;
  uniforms: Uniform[];
  revision: number;
  actions: DraftActions;
}

function sameUniform(left: Uniform, right: Uniform): boolean {
  if (
    left.id !== right.id ||
    left.name !== right.name ||
    left.type !== right.type
  ) {
    return false;
  }
  return left.type === "float" && right.type === "float"
    ? left.value === right.value &&
        left.min === right.min &&
        left.max === right.max
    : left.type === "color" && right.type === "color"
      ? left.draft === right.draft && left.valid === right.valid
      : false;
}

export function uniformsEqual(
  left: readonly Uniform[],
  right: readonly Uniform[],
): boolean {
  return (
    left.length === right.length &&
    left.every((uniform, index) => {
      const other = right[index];
      return other !== undefined && sameUniform(uniform, other);
    })
  );
}

function commitDraft(
  set: (partial: Partial<DraftState>) => void,
  get: () => DraftState,
  changes: DraftCommit,
): boolean {
  const state = get();
  const changed =
    (changes.main !== undefined && changes.main !== state.main) ||
    (changes.utils !== undefined && changes.utils !== state.utils) ||
    (changes.uniforms !== undefined &&
      !uniformsEqual(changes.uniforms, state.uniforms));
  if (!changed) return false;

  set({
    ...(changes.main !== undefined ? { main: changes.main } : {}),
    ...(changes.utils !== undefined ? { utils: changes.utils } : {}),
    ...(changes.uniforms !== undefined
      ? { uniforms: cloneUniforms(changes.uniforms) }
      : {}),
    revision: state.revision + 1,
  });
  return true;
}

export function createDraftStore() {
  return create<DraftState>((set, get) => ({
    main: initialShaderSource,
    utils: "",
    uniforms: [],
    revision: 0,
    actions: {
      setSource: (document, source) => {
        commitDraft(set, get, { [document]: source } as DraftCommit);
      },
      setUniforms: (uniforms) => {
        const current = get().uniforms;
        commitDraft(set, get, {
          uniforms:
            typeof uniforms === "function"
              ? uniforms(cloneUniforms(current))
              : uniforms,
        });
      },
      commit: (changes) => commitDraft(set, get, changes),
    },
  }));
}

export const useDraftStore = createDraftStore();
export type DraftStore = ReturnType<typeof createDraftStore>;

export const useMainSource = () => useDraftStore((state) => state.main);
export const useUtilsSource = () => useDraftStore((state) => state.utils);
export const useDraftSource = (document: DraftDocument) =>
  useDraftStore((state) => state[document]);
export const useDraftUniforms = () => useDraftStore((state) => state.uniforms);
export const useDraftActions = () => useDraftStore((state) => state.actions);

export function getDraftState(): DraftState {
  return useDraftStore.getState();
}

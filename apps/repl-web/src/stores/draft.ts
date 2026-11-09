import { create } from "zustand";
import { initialShaderSource } from "../shared/initial-source.ts";
import type { Uniform } from "../shared/uniforms";

export type DraftDocument = "main" | "utils";

interface DraftActions {
  setSource: (document: DraftDocument, source: string) => void;
  setUniforms: (
    uniforms: Uniform[] | ((current: Uniform[]) => Uniform[]),
  ) => void;
}

export interface DraftState {
  main: string;
  utils: string;
  uniforms: Uniform[];
  actions: DraftActions;
}

export const useDraftStore = create<DraftState>((set) => ({
  main: initialShaderSource,
  utils: "",
  uniforms: [],
  actions: {
    setSource: (document, source) => set({ [document]: source }),
    setUniforms: (uniforms) =>
      set((state) => ({
        uniforms:
          typeof uniforms === "function" ? uniforms(state.uniforms) : uniforms,
      })),
  },
}));

export const useMainSource = () => useDraftStore((state) => state.main);
export const useUtilsSource = () => useDraftStore((state) => state.utils);
export const useDraftSource = (document: DraftDocument) =>
  useDraftStore((state) => state[document]);
export const useDraftUniforms = () => useDraftStore((state) => state.uniforms);
export const useDraftActions = () => useDraftStore((state) => state.actions);

export function getDraftState(): DraftState {
  return useDraftStore.getState();
}

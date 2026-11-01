import { create } from "zustand";

type StateSetter<T> = (curr: T | ((current: T) => T)) => void;

type PreviewDrawerMode = "controls" | "closed";

interface PreviewState {
  drawerMode: PreviewDrawerMode;
  actions: PreviewActions;
}

interface PreviewActions {
  setDrawerMode: StateSetter<PreviewDrawerMode>;
}

const usePreviewStore = create<PreviewState>((set) => ({
  drawerMode: "closed",
  actions: {
    setDrawerMode: (mode) =>
      set((state) => ({
        drawerMode: typeof mode === "function" ? mode(state.drawerMode) : mode,
      })),
  },
}));

export const useDrawerMode = () => usePreviewStore((state) => state.drawerMode);
export const usePreviewActions = () =>
  usePreviewStore((state) => state.actions);

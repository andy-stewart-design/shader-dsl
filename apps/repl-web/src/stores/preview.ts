import { create } from "zustand";

type StateSetter<T> = (current: T | ((current: T) => T)) => void;
export type PreviewDrawerMode = "controls" | "closed";

interface PreviewActions {
  setDrawerMode: StateSetter<PreviewDrawerMode>;
  setPlaying: StateSetter<boolean>;
  setWidthRatio: StateSetter<number>;
  setHeightRatio: StateSetter<number>;
}

interface PreviewState {
  drawerMode: PreviewDrawerMode;
  playing: boolean;
  widthRatio: number;
  heightRatio: number;
  actions: PreviewActions;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  drawerMode: "closed",
  playing: true,
  widthRatio: 1,
  heightRatio: 1,
  actions: {
    setDrawerMode: (value) =>
      set((state) => ({
        drawerMode:
          typeof value === "function" ? value(state.drawerMode) : value,
      })),
    setPlaying: (value) =>
      set((state) => ({
        playing: typeof value === "function" ? value(state.playing) : value,
      })),
    setWidthRatio: (value) =>
      set((state) => ({
        widthRatio:
          typeof value === "function" ? value(state.widthRatio) : value,
      })),
    setHeightRatio: (value) =>
      set((state) => ({
        heightRatio:
          typeof value === "function" ? value(state.heightRatio) : value,
      })),
  },
}));

export const useDrawerMode = () => usePreviewStore((state) => state.drawerMode);
export const usePlaying = () => usePreviewStore((state) => state.playing);
export const useWidthRatio = () => usePreviewStore((state) => state.widthRatio);
export const useHeightRatio = () =>
  usePreviewStore((state) => state.heightRatio);
export const usePreviewActions = () =>
  usePreviewStore((state) => state.actions);

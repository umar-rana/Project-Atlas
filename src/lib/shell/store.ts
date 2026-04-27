"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ShellStore {
  _shellHydrated: boolean;
  commandPaletteOpen: boolean;
  shortcutsOverlayOpen: boolean;
  captureModalOpen: boolean;
  inspectorOpen: boolean;
  inspectorPinned: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  setShortcutsOverlayOpen: (v: boolean) => void;
  setCaptureModalOpen: (v: boolean) => void;
  setInspectorOpen: (v: boolean) => void;
  setInspectorPinned: (v: boolean) => void;
}

export const useShellStore = create<ShellStore>()(
  persist(
    (set) => ({
      _shellHydrated: false,
      commandPaletteOpen: false,
      shortcutsOverlayOpen: false,
      captureModalOpen: false,
      inspectorOpen: false,
      inspectorPinned: false,
      setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
      setShortcutsOverlayOpen: (v) => set({ shortcutsOverlayOpen: v }),
      setCaptureModalOpen: (v) => set({ captureModalOpen: v }),
      setInspectorOpen: (v) => set({ inspectorOpen: v }),
      setInspectorPinned: (v) => set({ inspectorPinned: v }),
    }),
    {
      name: "atlas-shell-prefs",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        inspectorOpen: state.inspectorOpen,
        inspectorPinned: state.inspectorPinned,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          useShellStore.setState({ _shellHydrated: true });
        }
      },
    },
  ),
);

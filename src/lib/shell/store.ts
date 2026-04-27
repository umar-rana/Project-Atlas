"use client";

import { create } from "zustand";

interface ShellStore {
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

export const useShellStore = create<ShellStore>((set) => ({
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
}));

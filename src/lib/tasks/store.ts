"use client";

import { create } from "zustand";

type GroupBy = "none" | "project" | "due" | "context";
type SortBy = "manual" | "due" | "title" | "created";

interface TasksStoreState {
  selectedTaskId: string | null;
  selectedTaskIds: Set<string>;
  lastClickedId: string | null;
  groupBy: GroupBy;
  sortBy: SortBy;
  setSelectedTaskId: (id: string | null) => void;
  toggleSelected: (id: string, opts?: { rangeFromLastTo?: string[] }) => void;
  clearSelection: () => void;
  selectMany: (ids: string[]) => void;
  setLastClicked: (id: string | null) => void;
  setGroupBy: (g: GroupBy) => void;
  setSortBy: (s: SortBy) => void;
}

export const useTasksStore = create<TasksStoreState>((set) => ({
  selectedTaskId: null,
  selectedTaskIds: new Set<string>(),
  lastClickedId: null,
  groupBy: "none",
  sortBy: "manual",
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  toggleSelected: (id) =>
    set((state) => {
      const next = new Set(state.selectedTaskIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedTaskIds: next, lastClickedId: id };
    }),
  selectMany: (ids) =>
    set((state) => {
      const next = new Set(state.selectedTaskIds);
      for (const id of ids) next.add(id);
      return { selectedTaskIds: next };
    }),
  clearSelection: () => set({ selectedTaskIds: new Set<string>() }),
  setLastClicked: (id) => set({ lastClickedId: id }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortBy: (sortBy) => set({ sortBy }),
}));

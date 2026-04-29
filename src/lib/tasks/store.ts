"use client";

import { create } from "zustand";

type GroupBy = "none" | "project" | "due" | "context";
type SortBy = "manual" | "due" | "title" | "created";

interface InspectorBreadcrumb {
  taskId: string;
  title: string;
}

interface TasksStoreState {
  selectedTaskId: string | null;
  selectedTaskIds: Set<string>;
  lastClickedId: string | null;
  groupBy: GroupBy;
  sortBy: SortBy;
  expandedParentIds: Set<string>;
  inspectorBreadcrumb: InspectorBreadcrumb | null;
  setSelectedTaskId: (id: string | null) => void;
  toggleSelected: (id: string, opts?: { rangeFromLastTo?: string[] }) => void;
  clearSelection: () => void;
  selectMany: (ids: string[]) => void;
  setLastClicked: (id: string | null) => void;
  setGroupBy: (g: GroupBy) => void;
  setSortBy: (s: SortBy) => void;
  toggleExpandedParent: (id: string) => void;
  setInspectorBreadcrumb: (crumb: InspectorBreadcrumb | null) => void;
  navigateToSubtask: (subtaskId: string, parentId: string, parentTitle: string) => void;
}

export const useTasksStore = create<TasksStoreState>((set) => ({
  selectedTaskId: null,
  selectedTaskIds: new Set<string>(),
  lastClickedId: null,
  groupBy: "none",
  sortBy: "manual",
  expandedParentIds: new Set<string>(),
  inspectorBreadcrumb: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id, inspectorBreadcrumb: null }),
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
  toggleExpandedParent: (id) =>
    set((state) => {
      const next = new Set(state.expandedParentIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedParentIds: next };
    }),
  setInspectorBreadcrumb: (crumb) => set({ inspectorBreadcrumb: crumb }),
  navigateToSubtask: (subtaskId, parentId, parentTitle) =>
    set({
      selectedTaskId: subtaskId,
      inspectorBreadcrumb: { taskId: parentId, title: parentTitle },
    }),
}));

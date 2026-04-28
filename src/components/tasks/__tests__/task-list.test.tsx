import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

interface ListTaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  flagged: boolean;
  project_id: string | null;
  parent_id: string | null;
  defer_date: Date | string | null;
  due_date: Date | string | null;
  estimated_minutes: number | null;
  contexts: { context: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string } }[];
  project: { id: string; title: string; color: string | null } | null;
  subtasks?: { id: string; status: string; title: string }[];
  is_blocked?: boolean;
}

// Configurable per-endpoint stubs. Tests poke `mockState.queries.tasksList`
// before render; mutations are tracked by path so we can assert moveMut
// payloads if needed.
const mockState = vi.hoisted(() => ({
  queries: {
    tasksList: [] as ListTaskRow[],
  },
  mutates: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
  mutateAsyncs: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
}));

vi.mock("@/lib/trpc/client", async () => {
  const { vi: vitestVi } = await import("vitest");

  function getMutate(path: string) {
    let fn = mockState.mutates.get(path);
    if (!fn) {
      fn = vitestVi.fn();
      mockState.mutates.set(path, fn);
    }
    return fn;
  }
  function getMutateAsync(path: string) {
    let fn = mockState.mutateAsyncs.get(path);
    if (!fn) {
      fn = vitestVi.fn(async () => ({}));
      mockState.mutateAsyncs.set(path, fn);
    }
    return fn;
  }

  function buildEndpoint(path: string) {
    return {
      useQuery: () => {
        if (path === "tasks.list") {
          return { data: mockState.queries.tasksList, isLoading: false };
        }
        if (path === "projects.list" || path === "contexts.list" || path === "tags.list") {
          return { data: [], isLoading: false };
        }
        if (path === "capture.inboxProjectHints") {
          return { data: {}, isLoading: false };
        }
        return { data: undefined, isLoading: false };
      },
      useMutation: () => ({
        mutate: getMutate(path),
        mutateAsync: getMutateAsync(path),
      }),
    };
  }

  const invalidate = vitestVi.fn();
  const utils = {
    tasks: {
      list: { invalidate },
      get: { invalidate },
      counts: { invalidate },
    },
    tags: { list: { invalidate } },
    projects: { list: { invalidate } },
    client: {
      tasks: {
        complete: { mutate: vitestVi.fn(async () => ({})) },
        uncomplete: { mutate: vitestVi.fn(async () => ({})) },
        update: { mutate: vitestVi.fn(async () => ({})) },
      },
    },
  };

  function buildRouter(routerName: string) {
    return new Proxy(
      {},
      {
        get(_t, endpointName: string) {
          return buildEndpoint(`${routerName}.${endpointName}`);
        },
      },
    );
  }

  const trpc = new Proxy(
    { useUtils: () => utils } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key === "useUtils") return target.useUtils;
        return buildRouter(key);
      },
    },
  );

  return { trpc };
});

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Stub child components that own their own tRPC trees / are out of scope for
// the selection-model smoke tests. BulkActionBar is intentionally NOT mocked
// — we want one end-to-end smoke that proves the selection set actually
// reaches a bulk mutation, not just that it lands in the store.
vi.mock("../task-quick-add", () => ({
  TaskQuickAdd: () => null,
}));

import { TaskList } from "../task-list";
import { useTasksStore } from "@/lib/tasks/store";

function makeRow(id: string, overrides: Partial<ListTaskRow> = {}): ListTaskRow {
  return {
    id,
    title: `Task ${id}`,
    notes: null,
    status: "active",
    flagged: false,
    project_id: null,
    parent_id: null,
    defer_date: null,
    due_date: null,
    estimated_minutes: null,
    contexts: [],
    tags: [],
    project: null,
    subtasks: [],
    is_blocked: false,
    ...overrides,
  };
}

function resetStore() {
  useTasksStore.setState({
    selectedTaskId: null,
    selectedTaskIds: new Set<string>(),
    lastClickedId: null,
  });
}

describe("TaskList — bulk-action selection model", () => {
  beforeEach(() => {
    for (const fn of mockState.mutates.values()) fn.mockClear();
    for (const fn of mockState.mutateAsyncs.values()) fn.mockClear();
    mockState.queries.tasksList = [
      makeRow("t1"),
      makeRow("t2"),
      makeRow("t3"),
      makeRow("t4"),
      makeRow("t5"),
    ];
    resetStore();
  });

  function renderList() {
    return render(
      <TaskList
        perspective="inbox"
        title="Inbox"
        enableQuickAdd={false}
      />,
    );
  }

  function row(container: HTMLElement, id: string) {
    const el = container.querySelector(`[data-task-id="${id}"]`);
    if (!el) throw new Error(`Row ${id} not found`);
    return el as HTMLElement;
  }

  it("Cmd-click toggles a row into the multi-selection set without affecting selectedTaskId", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t2"), { metaKey: true });
    });
    const state = useTasksStore.getState();
    expect(Array.from(state.selectedTaskIds)).toEqual(["t2"]);
    expect(state.lastClickedId).toBe("t2");
    // Cmd-click goes through onMultiToggle, not onSelect, so the inspector
    // selection (selectedTaskId) stays where it was — null in this case.
    expect(state.selectedTaskId).toBeNull();
  });

  it("Cmd-clicking the same row again removes it from the multi-selection set", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t2"), { ctrlKey: true });
    });
    expect(Array.from(useTasksStore.getState().selectedTaskIds)).toEqual(["t2"]);

    act(() => {
      fireEvent.click(row(container, "t2"), { ctrlKey: true });
    });
    expect(Array.from(useTasksStore.getState().selectedTaskIds)).toEqual([]);
  });

  it("Cmd-clicking multiple distinct rows accumulates them into the selection set", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t1"), { metaKey: true });
      fireEvent.click(row(container, "t3"), { metaKey: true });
      fireEvent.click(row(container, "t5"), { metaKey: true });
    });
    expect(Array.from(useTasksStore.getState().selectedTaskIds).sort()).toEqual([
      "t1",
      "t3",
      "t5",
    ]);
    expect(useTasksStore.getState().lastClickedId).toBe("t5");
  });

  it("Shift-click after a normal click range-selects from the anchor through the target", () => {
    const { container } = renderList();
    // Normal click sets the anchor (lastClickedId) to t2 and clears any
    // existing multi-selection.
    act(() => {
      fireEvent.click(row(container, "t2"));
    });
    expect(useTasksStore.getState().lastClickedId).toBe("t2");
    expect(useTasksStore.getState().selectedTaskId).toBe("t2");

    // Shift-click on t4 → range t2..t4 added to selection.
    act(() => {
      fireEvent.click(row(container, "t4"), { shiftKey: true });
    });
    expect(Array.from(useTasksStore.getState().selectedTaskIds).sort()).toEqual([
      "t2",
      "t3",
      "t4",
    ]);
  });

  it("Shift-click works the same way when the anchor is below the target (reverse range)", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t4"));
    });
    act(() => {
      fireEvent.click(row(container, "t2"), { shiftKey: true });
    });
    expect(Array.from(useTasksStore.getState().selectedTaskIds).sort()).toEqual([
      "t2",
      "t3",
      "t4",
    ]);
  });

  it("Plain click on another row clears the multi-selection (back to single-select)", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t1"), { metaKey: true });
      fireEvent.click(row(container, "t3"), { metaKey: true });
    });
    expect(useTasksStore.getState().selectedTaskIds.size).toBe(2);

    act(() => {
      fireEvent.click(row(container, "t5"));
    });
    const state = useTasksStore.getState();
    expect(state.selectedTaskId).toBe("t5");
    expect(Array.from(state.selectedTaskIds)).toEqual([]);
    expect(state.lastClickedId).toBe("t5");
  });

  it("Shift-click without a prior anchor falls back to a single toggle", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t3"), { shiftKey: true });
    });
    // No lastClickedId yet → range path is skipped, toggleSelected runs instead.
    expect(Array.from(useTasksStore.getState().selectedTaskIds)).toEqual(["t3"]);
    expect(useTasksStore.getState().lastClickedId).toBe("t3");
  });

  it("a multi-selection feeds straight into the bulk-action bar's tasks.bulkComplete", () => {
    // End-to-end smoke: select two rows via cmd-click, then click the
    // BulkActionBar's "Complete" button. The bar reads `selectedTaskIds`
    // from the same store the rows write to, so this proves the selection
    // model actually reaches a real bulk mutation payload — not just that
    // it lands in zustand state.
    const { container, getByRole } = renderList();
    act(() => {
      fireEvent.click(row(container, "t2"), { metaKey: true });
      fireEvent.click(row(container, "t4"), { metaKey: true });
    });

    const completeBtn = getByRole("button", { name: /Complete/i });
    fireEvent.click(completeBtn);

    const bulkComplete = mockState.mutates.get("tasks.bulkComplete");
    expect(bulkComplete?.mock.calls.length ?? 0).toBe(1);
    const arg = bulkComplete!.mock.calls[0][0] as { ids: string[] };
    expect([...arg.ids].sort()).toEqual(["t2", "t4"]);
  });
});

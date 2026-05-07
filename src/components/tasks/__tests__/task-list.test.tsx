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
//
// `clientMutates` exposes the direct-client mutate fns used by the keyboard
// handler (utils.client.tasks.*) so keyboard-shortcut tests can assert on them.
const mockState = vi.hoisted(() => ({
  queries: {
    tasksList: [] as ListTaskRow[],
  },
  mutates: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
  mutateAsyncs: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
  clientMutates: {
    complete: null as ReturnType<typeof import("vitest").vi.fn> | null,
    uncomplete: null as ReturnType<typeof import("vitest").vi.fn> | null,
    update: null as ReturnType<typeof import("vitest").vi.fn> | null,
  },
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

  // These are the fns called by the keyboard handler via utils.client.tasks.*
  // They are stored in mockState so tests outside the factory can assert on them.
  const completeMutate = vitestVi.fn(async () => ({}));
  const uncompleteMutate = vitestVi.fn(async () => ({}));
  const updateMutate = vitestVi.fn(async () => ({}));

  mockState.clientMutates.complete = completeMutate;
  mockState.clientMutates.uncomplete = uncompleteMutate;
  mockState.clientMutates.update = updateMutate;

  const utils = {
    tasks: {
      list: { invalidate },
      get: { invalidate },
      counts: { invalidate },
      completed: { invalidate },
    },
    tags: { list: { invalidate } },
    projects: { list: { invalidate } },
    client: {
      tasks: {
        complete: { mutate: completeMutate },
        uncomplete: { mutate: uncompleteMutate },
        update: { mutate: updateMutate },
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

  const trpc = new Proxy({ useUtils: () => utils } as Record<string, unknown>, {
    get(target, key: string) {
      if (key === "useUtils") return target.useUtils;
      return buildRouter(key);
    },
  });

  return { trpc };
});

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/ui/hint", () => ({
  Hint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub child components that own their own tRPC trees / are out of scope for
// the selection-model smoke tests. BulkActionBar is intentionally NOT mocked
// — we want one end-to-end smoke that proves the selection set actually
// reaches a bulk mutation, not just that it lands in the store.
vi.mock("../task-quick-add", () => ({
  TaskQuickAdd: () => null,
}));

vi.mock("../recurrence-quick-popover", () => ({
  RecurrenceQuickPopover: () => null,
}));

vi.mock("../task-row-quick-actions", () => ({
  TaskRowQuickActions: ({
    onDismiss,
  }: {
    task: unknown;
    onAnyPopoverOpenChange: (b: boolean) => void;
    autoFocusFirstButton?: boolean;
    onDismiss?: () => void;
  }) => (
    <div
      role="toolbar"
      aria-label="Quick actions"
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Escape") onDismiss?.();
      }}
    >
      <button type="button">Action 1</button>
      <button type="button">Action 2</button>
      <button type="button">Action 3</button>
    </div>
  ),
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

/** Fire a keydown on window — simulates global keyboard shortcuts. */
function pressKey(key: string, extra: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
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
    return render(<TaskList perspective="today" title="Today" enableQuickAdd={false} />);
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
    expect(Array.from(useTasksStore.getState().selectedTaskIds).sort()).toEqual(["t1", "t3", "t5"]);
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
    expect(Array.from(useTasksStore.getState().selectedTaskIds).sort()).toEqual(["t2", "t3", "t4"]);
  });

  it("Shift-click works the same way when the anchor is below the target (reverse range)", () => {
    const { container } = renderList();
    act(() => {
      fireEvent.click(row(container, "t4"));
    });
    act(() => {
      fireEvent.click(row(container, "t2"), { shiftKey: true });
    });
    expect(Array.from(useTasksStore.getState().selectedTaskIds).sort()).toEqual(["t2", "t3", "t4"]);
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
    const arg = bulkComplete!.mock.calls[0]![0] as { ids: string[] };
    expect([...arg.ids].sort()).toEqual(["t2", "t4"]);
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
// The handler lives in a `useEffect` in TaskList and calls
// `utils.client.tasks.<endpoint>.mutate(...)` directly (bypassing useMutation).
// These tests drive `window.dispatchEvent` keydowns and assert the correct
// mutation / store state changes occur, and that INPUT/TEXTAREA elements
// suppress all shortcuts.
// ---------------------------------------------------------------------------
describe("TaskList — keyboard shortcuts", () => {
  beforeEach(() => {
    mockState.clientMutates.complete?.mockClear();
    mockState.clientMutates.uncomplete?.mockClear();
    mockState.clientMutates.update?.mockClear();
    for (const fn of mockState.mutates.values()) fn.mockClear();
    mockState.queries.tasksList = [makeRow("a1"), makeRow("a2"), makeRow("a3")];
    resetStore();
  });

  function renderList() {
    return render(<TaskList perspective="inbox" title="Inbox" enableQuickAdd={false} />);
  }

  // 'j' / 'k' focus movement is verified by pressing the navigation key then
  // triggering a mutation shortcut and checking which task id was used.

  it("'j' moves focus to the next row: space then fires complete on the second task", () => {
    renderList();

    pressKey("j");
    pressKey(" ");

    expect(mockState.clientMutates.complete).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a2" });
  });

  it("multiple 'j' presses advance focus through the list", () => {
    renderList();

    pressKey("j");
    pressKey("j");
    pressKey(" ");

    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a3" });
  });

  it("'j' clamps at the last row — further presses do not go out of bounds", () => {
    renderList();

    // More presses than rows.
    pressKey("j");
    pressKey("j");
    pressKey("j");
    pressKey("j");
    pressKey(" ");

    // Still fires on the last task (a3), not undefined.
    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a3" });
  });

  it("'k' moves focus back to the previous row", () => {
    renderList();

    pressKey("j");
    pressKey("j");
    pressKey("k");
    pressKey(" ");

    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a2" });
  });

  it("'k' clamps at the first row — further presses do not go below 0", () => {
    renderList();

    pressKey("k");
    pressKey("k");
    pressKey(" ");

    // Initial index is 0, clamped — still fires on a1.
    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a1" });
  });

  it("space fires tasks.complete.mutate with the focused task's id (active task)", () => {
    renderList();

    pressKey(" ");

    expect(mockState.clientMutates.complete).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a1" });
    expect(mockState.clientMutates.uncomplete).not.toHaveBeenCalled();
  });

  it("space fires tasks.uncomplete.mutate when the focused task is already completed", () => {
    mockState.queries.tasksList = [
      makeRow("a1", { status: "completed" }),
      makeRow("a2"),
      makeRow("a3"),
    ];
    renderList();

    pressKey(" ");

    expect(mockState.clientMutates.uncomplete).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.uncomplete).toHaveBeenCalledWith({ id: "a1" });
    expect(mockState.clientMutates.complete).not.toHaveBeenCalled();
  });

  it("Cmd+D fires tasks.complete.mutate for the focused task", () => {
    renderList();

    pressKey("d", { metaKey: true });

    expect(mockState.clientMutates.complete).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a1" });
  });

  it("Ctrl+D also fires tasks.complete.mutate (cross-platform modifier)", () => {
    renderList();

    pressKey("d", { ctrlKey: true });

    expect(mockState.clientMutates.complete).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.complete).toHaveBeenCalledWith({ id: "a1" });
  });

  it("'f' fires tasks.update.mutate to flag the focused (unflagged) task", () => {
    renderList();

    pressKey("f");

    expect(mockState.clientMutates.update).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.update).toHaveBeenCalledWith({ id: "a1", flagged: true });
  });

  it("'f' fires tasks.update.mutate to unflag the focused (already-flagged) task", () => {
    mockState.queries.tasksList = [makeRow("a1", { flagged: true }), makeRow("a2"), makeRow("a3")];
    renderList();

    pressKey("f");

    expect(mockState.clientMutates.update).toHaveBeenCalledTimes(1);
    expect(mockState.clientMutates.update).toHaveBeenCalledWith({ id: "a1", flagged: false });
  });

  it("Cmd+I sets selectedTaskId in the store to the focused task", () => {
    renderList();

    pressKey("j");
    pressKey("i", { metaKey: true });

    expect(useTasksStore.getState().selectedTaskId).toBe("a2");
  });

  it("Ctrl+I also sets selectedTaskId (cross-platform modifier)", () => {
    renderList();

    pressKey("i", { ctrlKey: true });

    expect(useTasksStore.getState().selectedTaskId).toBe("a1");
  });

  it("all shortcuts are suppressed when the event target is an INPUT element", () => {
    renderList();

    const input = document.createElement("input");
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "i", metaKey: true, bubbles: true }));
    });

    expect(mockState.clientMutates.complete).not.toHaveBeenCalled();
    expect(mockState.clientMutates.uncomplete).not.toHaveBeenCalled();
    expect(mockState.clientMutates.update).not.toHaveBeenCalled();
    expect(useTasksStore.getState().selectedTaskId).toBeNull();

    document.body.removeChild(input);
  });

  it("all shortcuts are suppressed when the event target is a TEXTAREA element", () => {
    renderList();

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    });

    expect(mockState.clientMutates.complete).not.toHaveBeenCalled();
    expect(mockState.clientMutates.uncomplete).not.toHaveBeenCalled();
    expect(mockState.clientMutates.update).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it("shortcuts do nothing when the task list is empty", () => {
    mockState.queries.tasksList = [];
    renderList();

    pressKey("j");
    pressKey("k");
    pressKey(" ");
    pressKey("f");
    pressKey("i", { metaKey: true });

    expect(mockState.clientMutates.complete).not.toHaveBeenCalled();
    expect(mockState.clientMutates.update).not.toHaveBeenCalled();
    expect(useTasksStore.getState().selectedTaskId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Quick-actions shortcut (.)
// ---------------------------------------------------------------------------
// Pressing "." while a task row is keyboard-focused should reveal the
// quick-action toolbar for that row. Pressing j/k or Escape should dismiss it.
// ---------------------------------------------------------------------------
describe("TaskList — quick-actions shortcut (.)", () => {
  beforeEach(() => {
    mockState.clientMutates.complete?.mockClear();
    mockState.clientMutates.update?.mockClear();
    for (const fn of mockState.mutates.values()) fn.mockClear();
    mockState.queries.tasksList = [makeRow("q1"), makeRow("q2"), makeRow("q3")];
    resetStore();
  });

  function renderList() {
    return render(<TaskList perspective="inbox" title="Inbox" enableQuickAdd={false} />);
  }

  it("pressing '.' shows the quick-action toolbar for the focused task row", () => {
    const { getAllByRole } = renderList();

    expect(() => getAllByRole("toolbar")).toThrow();

    pressKey(".");

    const toolbars = getAllByRole("toolbar", { name: "Quick actions" });
    expect(toolbars.length).toBe(1);
  });

  it("pressing '.' after 'j' shows the toolbar for the second row, not the first", () => {
    const { container, getAllByRole } = renderList();

    pressKey("j");
    pressKey(".");

    const toolbars = getAllByRole("toolbar", { name: "Quick actions" });
    expect(toolbars.length).toBe(1);

    const rows = container.querySelectorAll("[data-task-id]");
    const toolbarRow = toolbars[0]!.closest("[data-task-id]");
    expect(toolbarRow).toBe(rows[1]);
  });

  it("pressing 'j' after '.' dismisses the quick-action toolbar", () => {
    const { getAllByRole, queryAllByRole } = renderList();

    pressKey(".");
    expect(getAllByRole("toolbar", { name: "Quick actions" }).length).toBe(1);

    pressKey("j");
    expect(queryAllByRole("toolbar", { name: "Quick actions" }).length).toBe(0);
  });

  it("pressing 'k' after '.' dismisses the quick-action toolbar", () => {
    const { getAllByRole, queryAllByRole } = renderList();

    pressKey("j");
    pressKey(".");
    expect(getAllByRole("toolbar", { name: "Quick actions" }).length).toBe(1);

    pressKey("k");
    expect(queryAllByRole("toolbar", { name: "Quick actions" }).length).toBe(0);
  });

  it("pressing 'Escape' after '.' dismisses the quick-action toolbar", () => {
    const { getAllByRole, queryAllByRole } = renderList();

    pressKey(".");
    expect(getAllByRole("toolbar", { name: "Quick actions" }).length).toBe(1);

    pressKey("Escape");
    expect(queryAllByRole("toolbar", { name: "Quick actions" }).length).toBe(0);
  });

  it("'.' is suppressed when the event target is an INPUT element", () => {
    const { queryAllByRole } = renderList();

    const input = document.createElement("input");
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: ".", bubbles: true }));
    });

    expect(queryAllByRole("toolbar", { name: "Quick actions" }).length).toBe(0);

    document.body.removeChild(input);
  });

  it("'.' does nothing when the task list is empty", () => {
    mockState.queries.tasksList = [];
    const { queryAllByRole } = renderList();

    pressKey(".");

    expect(queryAllByRole("toolbar", { name: "Quick actions" }).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop reordering
// ---------------------------------------------------------------------------
// The drag path is completely separate from keyboard / click handlers:
//   onDragStart  → sets dragId.current
//   onDragOver   → sets dropTargetId.current (not asserted, but exercised)
//   onDrop       → reads dragId, computes before_id/after_id, calls moveMut
//
// Each test fires DOM drag events on the task-row divs so that the real
// event handlers in TaskListItem (which call the parent callbacks) run,
// rather than calling the callbacks directly. This catches regressions in
// the index math *and* in the wiring between the child event handlers and
// the parent's mutate call.
// ---------------------------------------------------------------------------
describe("TaskList — drag-and-drop reordering", () => {
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
    return render(<TaskList perspective="inbox" title="Inbox" enableQuickAdd={false} />);
  }

  function getRow(container: HTMLElement, id: string): HTMLElement {
    const el = container.querySelector(`[data-task-id="${id}"]`);
    if (!el) throw new Error(`Row ${id} not found`);
    return el as HTMLElement;
  }

  function dragRowOntoRow(container: HTMLElement, sourceId: string, targetId: string) {
    const source = getRow(container, sourceId);
    const target = getRow(container, targetId);
    act(() => {
      fireEvent.dragStart(source, {
        dataTransfer: { setData: () => {} },
      });
      fireEvent.dragOver(target);
      fireEvent.drop(target);
    });
  }

  it("dragging a row above another fires tasks.move with the correct before_id and after_id", () => {
    // Drag t4 (idx 3) onto t2 (idx 1) — moving upward.
    // Expected placement: between t1 (before) and t2 (after).
    const { container } = renderList();
    dragRowOntoRow(container, "t4", "t2");

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate).toHaveBeenCalledTimes(1);
    expect(moveMutate).toHaveBeenCalledWith({
      id: "t4",
      before_id: "t1",
      after_id: "t2",
    });
  });

  it("dragging a row below another fires tasks.move with the correct before_id and after_id", () => {
    // Drag t2 (idx 1) onto t4 (idx 3) — moving downward.
    // Expected placement: between t4 (before) and t5 (after).
    const { container } = renderList();
    dragRowOntoRow(container, "t2", "t4");

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate).toHaveBeenCalledTimes(1);
    expect(moveMutate).toHaveBeenCalledWith({
      id: "t2",
      before_id: "t4",
      after_id: "t5",
    });
  });

  it("dragging a row onto itself is a no-op (tasks.move is not called)", () => {
    const { container } = renderList();
    dragRowOntoRow(container, "t3", "t3");

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate?.mock.calls.length ?? 0).toBe(0);
  });

  it("dragging the last row above the first clamps: before_id is null, after_id is the first row", () => {
    // Drag t5 (idx 4) onto t1 (idx 0) — moving to the very top.
    // beforeIdx = 0 - 1 = -1 → before = undefined → before_id: null
    const { container } = renderList();
    dragRowOntoRow(container, "t5", "t1");

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate).toHaveBeenCalledTimes(1);
    expect(moveMutate).toHaveBeenCalledWith({
      id: "t5",
      before_id: null,
      after_id: "t1",
    });
  });

  it("dragging the first row below the last clamps: before_id is the last row, after_id is null", () => {
    // Drag t1 (idx 0) onto t5 (idx 4) — moving to the very bottom.
    // afterIdx = 4 + 1 = 5 → after = undefined → after_id: null
    const { container } = renderList();
    dragRowOntoRow(container, "t1", "t5");

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate).toHaveBeenCalledTimes(1);
    expect(moveMutate).toHaveBeenCalledWith({
      id: "t1",
      before_id: "t5",
      after_id: null,
    });
  });

  it("dragging an adjacent row above its neighbor fires tasks.move with the correct neighbours", () => {
    // Drag t3 (idx 2) onto t2 (idx 1) — swapping with the row directly above.
    // sourceIdx=2 > targetIdx=1 → beforeIdx=0 (t1), afterIdx=1 (t2)
    const { container } = renderList();
    dragRowOntoRow(container, "t3", "t2");

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate).toHaveBeenCalledTimes(1);
    expect(moveMutate).toHaveBeenCalledWith({
      id: "t3",
      before_id: "t1",
      after_id: "t2",
    });
  });

  it("tasks.move is not called when no drag has started before drop fires", () => {
    // Drop fires on a target without a prior dragStart — dragId.current is null.
    const { container } = renderList();
    act(() => {
      fireEvent.drop(getRow(container, "t3"));
    });

    const moveMutate = mockState.mutates.get("tasks.move");
    expect(moveMutate?.mock.calls.length ?? 0).toBe(0);
  });
});

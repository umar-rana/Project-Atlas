import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const real = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...real,
    useQueryClient: () => ({
      cancelQueries: vi.fn(async () => {}),
      getQueriesData: vi.fn(() => []),
      setQueriesData: vi.fn(),
      setQueryData: vi.fn(),
    }),
  };
});

// Per-endpoint mutation tracking. Every call to `trpc.<router>.<endpoint>.useMutation()`
// returns the same `vi.fn()` for that path, so tests can assert on the args passed
// to e.g. `tasks.complete.mutate(...)` regardless of which component instance fired it.
//
// The render counter is also exposed: every call to `trpc.useUtils()` increments it.
// `useUtils()` is called once on every render of `TaskListItemImpl`, so the counter is
// a faithful proxy for how many times the real component body actually ran. If
// `React.memo` ever regresses, parent re-renders will increment this counter.
const trpcState = vi.hoisted(() => ({
  taskListItemRenderCount: 0,
  mutates: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
  mutateAsyncs: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
}));

vi.mock("@/lib/trpc/client", async () => {
  const { vi: vitestVi } = await import("vitest");
  const invalidate = vitestVi.fn();
  const utils = {
    tasks: {
      list: { invalidate },
      counts: { invalidate },
      get: { invalidate },
    },
    tags: { list: { invalidate } },
  };

  function getMutate(path: string) {
    let fn = trpcState.mutates.get(path);
    if (!fn) {
      fn = vitestVi.fn();
      trpcState.mutates.set(path, fn);
    }
    return fn;
  }
  function getMutateAsync(path: string) {
    let fn = trpcState.mutateAsyncs.get(path);
    if (!fn) {
      fn = vitestVi.fn(async () => ({}));
      trpcState.mutateAsyncs.set(path, fn);
    }
    return fn;
  }

  function buildEndpoint(path: string) {
    return {
      useQuery: () => ({ data: undefined, isLoading: false }),
      useMutation: () => ({
        mutate: getMutate(path),
        mutateAsync: getMutateAsync(path),
      }),
    };
  }

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
    {
      useUtils: () => {
        trpcState.taskListItemRenderCount += 1;
        return utils;
      },
    } as Record<string, unknown>,
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

import { TaskListItem } from "../task-list-item";
import type { TaskRow } from "../task-list";

function makeRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task-1",
    title: "Buy milk",
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

function getMutate(path: string) {
  const fn = trpcState.mutates.get(path);
  if (!fn) throw new Error(`No mutate fn registered for ${path} yet`);
  return fn;
}

describe("TaskListItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trpcState.taskListItemRenderCount = 0;
    for (const fn of trpcState.mutates.values()) fn.mockClear();
    for (const fn of trpcState.mutateAsyncs.values()) fn.mockClear();
  });

  it("renders the task title", () => {
    const onSelect = vi.fn();
    const onMultiToggle = vi.fn();
    const { getByText } = render(
      <TaskListItem
        task={makeRow()}
        selected={false}
        isFocused={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onMultiToggle={onMultiToggle}
      />,
    );
    expect(getByText("Buy milk")).toBeInTheDocument();
  });

  it("React.memo skips re-rendering TaskListItem when its props are referentially stable", () => {
    // Stable callbacks + stable task object — exactly what TaskList itself
    // does via useCallback. Without React.memo this still re-renders every
    // time the parent re-renders, which is the regression we want to catch.
    const onSelect = vi.fn();
    const onMultiToggle = vi.fn();
    const task = makeRow();

    function Parent({ unrelated }: { unrelated: number }) {
      return (
        <div data-unrelated={unrelated}>
          <TaskListItem
            task={task}
            selected={false}
            isFocused={false}
            isMultiSelected={false}
            onSelect={onSelect}
            onMultiToggle={onMultiToggle}
          />
        </div>
      );
    }

    const { rerender } = render(<Parent unrelated={1} />);
    // RecurrenceQuickPopover (always rendered in the non-hover row) also calls
    // trpc.useUtils(), so each TaskListItem render increments the counter by 2.
    const countAfterMount = trpcState.taskListItemRenderCount;
    expect(countAfterMount).toBeGreaterThanOrEqual(1);

    rerender(<Parent unrelated={2} />);
    // Memo win: parent re-rendered, TaskListItem did not.
    expect(trpcState.taskListItemRenderCount).toBe(countAfterMount);

    rerender(<Parent unrelated={3} />);
    expect(trpcState.taskListItemRenderCount).toBe(countAfterMount);
  });

  it("re-renders TaskListItem when the task prop changes by reference", () => {
    const onSelect = vi.fn();
    const onMultiToggle = vi.fn();

    function Parent({ task }: { task: TaskRow }) {
      return (
        <TaskListItem
          task={task}
          selected={false}
          isFocused={false}
          isMultiSelected={false}
          onSelect={onSelect}
          onMultiToggle={onMultiToggle}
        />
      );
    }

    const t1 = makeRow();
    const { rerender, getByText } = render(<Parent task={t1} />);
    // RecurrenceQuickPopover (always rendered in the non-hover row) also calls
    // trpc.useUtils(), so capture the mount count rather than asserting a hard number.
    const countAfterMount = trpcState.taskListItemRenderCount;
    expect(countAfterMount).toBeGreaterThanOrEqual(1);

    // Same reference → memo still skips.
    rerender(<Parent task={t1} />);
    expect(trpcState.taskListItemRenderCount).toBe(countAfterMount);

    // New reference with new content → memo lets it through. The component
    // also has a `useEffect([task.title])` that resyncs the title draft, so
    // the render count goes up by more than one — we just assert "memo is
    // not skipping" rather than pinning the exact count.
    const t2 = makeRow({ title: "Buy bread" });
    rerender(<Parent task={t2} />);
    expect(trpcState.taskListItemRenderCount).toBeGreaterThan(countAfterMount);
    expect(getByText("Buy bread")).toBeInTheDocument();
  });

  describe("right-click context menu", () => {
    function openMenu(taskOverrides: Partial<TaskRow> = {}) {
      const utils = render(
        <TaskListItem
          task={makeRow(taskOverrides)}
          selected={false}
          isFocused={false}
          isMultiSelected={false}
          onSelect={vi.fn()}
          onMultiToggle={vi.fn()}
        />,
      );
      const row = utils.container.querySelector('[role="row"]') as HTMLElement;
      fireEvent.contextMenu(row);
      return utils;
    }

    it("'Mark complete' fires tasks.complete with the task id", () => {
      const { getByRole } = openMenu();
      fireEvent.click(getByRole("menuitem", { name: "Mark complete" }));
      const completeMutate = getMutate("tasks.complete");
      expect(completeMutate).toHaveBeenCalledTimes(1);
      expect(completeMutate).toHaveBeenCalledWith({ id: "task-1" });
    });

    it("'Move to trash' fires tasks.delete with the task id", () => {
      const { getByRole } = openMenu();
      fireEvent.click(getByRole("menuitem", { name: "Move to trash" }));
      const delMutate = getMutate("tasks.delete");
      expect(delMutate).toHaveBeenCalledTimes(1);
      expect(delMutate).toHaveBeenCalledWith({ id: "task-1" });
    });

    it("'Move to Inbox' fires tasks.update with project_id: null when the task is in a project", () => {
      const { getByRole } = openMenu({ project_id: "proj-9" });
      fireEvent.click(getByRole("menuitem", { name: "Move to Inbox" }));
      const updateMutate = getMutate("tasks.update");
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({ id: "task-1", project_id: null });
    });

    it("does not show 'Move to Inbox' when the task is already in the inbox", () => {
      const { queryByRole } = openMenu({ project_id: null });
      expect(queryByRole("menuitem", { name: "Move to Inbox" })).toBeNull();
    });
  });

  describe("quick-action popover pin", () => {
    function renderItem(overrides: Partial<TaskRow> = {}) {
      return render(
        <TaskListItem
          task={makeRow(overrides)}
          selected={false}
          isFocused={false}
          isMultiSelected={false}
          onSelect={vi.fn()}
          onMultiToggle={vi.fn()}
        />,
      );
    }

    it("reveals quick-action icons on mouse enter", () => {
      const { container, queryByRole } = renderItem();
      const row = container.querySelector('[role="row"]') as HTMLElement;

      expect(queryByRole("button", { name: "Set due date" })).toBeNull();

      act(() => { fireEvent.mouseEnter(row); });

      expect(queryByRole("button", { name: "Set due date" })).toBeInTheDocument();
    });

    it("hides quick-action icons on mouse leave when no popover is open", () => {
      const { container, queryByRole } = renderItem();
      const row = container.querySelector('[role="row"]') as HTMLElement;

      act(() => { fireEvent.mouseEnter(row); });
      expect(queryByRole("button", { name: "Set due date" })).toBeInTheDocument();

      act(() => { fireEvent.mouseLeave(row); });
      expect(queryByRole("button", { name: "Set due date" })).toBeNull();
    });

    it("keeps quick-action icons visible when a popover opens and the mouse leaves the row", () => {
      const { container, queryByRole } = renderItem();
      const row = container.querySelector('[role="row"]') as HTMLElement;

      act(() => { fireEvent.mouseEnter(row); });

      const dueDateBtn = queryByRole("button", { name: "Set due date" }) as HTMLElement;
      expect(dueDateBtn).toBeInTheDocument();

      act(() => { fireEvent.click(dueDateBtn); });

      act(() => { fireEvent.mouseLeave(row); });

      expect(queryByRole("button", { name: "Set due date" })).toBeInTheDocument();
    });

    it("hides quick-action icons after the popover closes and the mouse is outside the row", () => {
      const { container, queryByRole } = renderItem();
      const row = container.querySelector('[role="row"]') as HTMLElement;

      act(() => { fireEvent.mouseEnter(row); });

      const dueDateBtn = queryByRole("button", { name: "Set due date" }) as HTMLElement;
      act(() => { fireEvent.click(dueDateBtn); });
      act(() => { fireEvent.mouseLeave(row); });

      expect(queryByRole("button", { name: "Set due date" })).toBeInTheDocument();

      const dueDateBtnAgain = queryByRole("button", { name: "Set due date" }) as HTMLElement;
      act(() => { fireEvent.click(dueDateBtnAgain); });

      expect(queryByRole("button", { name: "Set due date" })).toBeNull();
    });

    it("re-shows quick-action icons when mouse re-enters the row after the popover closed", () => {
      const { container, queryByRole } = renderItem();
      const row = container.querySelector('[role="row"]') as HTMLElement;

      act(() => { fireEvent.mouseEnter(row); });
      const dueDateBtn = queryByRole("button", { name: "Set due date" }) as HTMLElement;
      act(() => { fireEvent.click(dueDateBtn); });
      act(() => { fireEvent.mouseLeave(row); });

      const dueDateBtnAgain = queryByRole("button", { name: "Set due date" }) as HTMLElement;
      act(() => { fireEvent.click(dueDateBtnAgain); });

      act(() => { fireEvent.mouseEnter(row); });
      expect(queryByRole("button", { name: "Set due date" })).toBeInTheDocument();
    });
  });

  describe("inline title edit", () => {
    function startEditing() {
      const utils = render(
        <TaskListItem
          task={makeRow()}
          selected={false}
          isFocused={false}
          isMultiSelected={false}
          onSelect={vi.fn()}
          onMultiToggle={vi.fn()}
        />,
      );
      const titleBtn = utils.getByText("Buy milk");
      fireEvent.doubleClick(titleBtn);
      const input = utils.container.querySelector("input[type='text'], input:not([type])") as HTMLInputElement;
      return { ...utils, input };
    }

    it("double-click + Enter commits the new title via tasks.update", () => {
      const { input } = startEditing();
      expect(input).toBeTruthy();
      act(() => {
        fireEvent.change(input, { target: { value: "Buy oat milk" } });
        fireEvent.keyDown(input, { key: "Enter" });
      });
      const updateMutate = getMutate("tasks.update");
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({ id: "task-1", title: "Buy oat milk" });
    });

    it("Escape cancels editing without firing tasks.update", () => {
      const { input, container } = startEditing();
      act(() => {
        fireEvent.change(input, { target: { value: "Buy oat milk" } });
        fireEvent.keyDown(input, { key: "Escape" });
      });
      const updateMutate = trpcState.mutates.get("tasks.update");
      expect(updateMutate?.mock.calls.length ?? 0).toBe(0);
      // The original title is restored and the editor is gone.
      expect(container.querySelector("input")).toBeNull();
    });

    it("does not fire tasks.update on Enter when the title is unchanged", () => {
      const { input } = startEditing();
      act(() => {
        fireEvent.keyDown(input, { key: "Enter" });
      });
      const updateMutate = trpcState.mutates.get("tasks.update");
      expect(updateMutate?.mock.calls.length ?? 0).toBe(0);
    });
  });
});

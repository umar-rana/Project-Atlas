import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// We expose a render counter via the trpc mock: every call to
// `trpc.useUtils()` increments it. `useUtils()` is called once on every
// render of `TaskListItemImpl`, so the counter is a faithful proxy for how
// many times the real component body actually ran. If `React.memo` ever
// regresses, parent re-renders will increment this counter.
const trpcRenderTracker = vi.hoisted(() => ({ taskListItemRenderCount: 0 }));

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

  function buildEndpoint() {
    return {
      useQuery: () => ({ data: undefined, isLoading: false }),
      useMutation: () => ({
        mutate: vitestVi.fn(),
        mutateAsync: vitestVi.fn(async () => ({})),
      }),
    };
  }

  function buildRouter() {
    return new Proxy({}, { get: () => buildEndpoint() });
  }

  const trpc = new Proxy(
    {
      useUtils: () => {
        trpcRenderTracker.taskListItemRenderCount += 1;
        return utils;
      },
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key === "useUtils") return target.useUtils;
        return buildRouter();
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

describe("TaskListItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trpcRenderTracker.taskListItemRenderCount = 0;
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
    expect(trpcRenderTracker.taskListItemRenderCount).toBe(1);

    rerender(<Parent unrelated={2} />);
    // Memo win: parent re-rendered, TaskListItem did not.
    expect(trpcRenderTracker.taskListItemRenderCount).toBe(1);

    rerender(<Parent unrelated={3} />);
    expect(trpcRenderTracker.taskListItemRenderCount).toBe(1);
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
    expect(trpcRenderTracker.taskListItemRenderCount).toBe(1);

    // Same reference → memo still skips.
    rerender(<Parent task={t1} />);
    expect(trpcRenderTracker.taskListItemRenderCount).toBe(1);

    // New reference with new content → memo lets it through. The component
    // also has a `useEffect([task.title])` that resyncs the title draft, so
    // the render count goes up by more than one — we just assert "memo is
    // not skipping" rather than pinning the exact count.
    const t2 = makeRow({ title: "Buy bread" });
    rerender(<Parent task={t2} />);
    expect(trpcRenderTracker.taskListItemRenderCount).toBeGreaterThan(1);
    expect(getByText("Buy bread")).toBeInTheDocument();
  });
});

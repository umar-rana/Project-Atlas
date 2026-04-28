import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockState = vi.hoisted(() => ({
  taskUpdateMutate: vi.fn(),
  tagCreateMutateAsync: vi.fn(async () => ({ id: "new-tag" })),
  invalidate: vi.fn(),
  taskData: undefined as unknown,
}));

vi.mock("@/lib/trpc/client", async () => {
  const { vi: vitestVi } = await import("vitest");
  function buildEndpoint(path: string) {
    return {
      useQuery: () => {
        if (path === "tasks.get") {
          return { data: mockState.taskData, isLoading: mockState.taskData === undefined };
        }
        if (path === "projects.list" || path === "contexts.list") {
          return { data: [], isLoading: false };
        }
        if (path === "tags.list") {
          return { data: [], isLoading: false };
        }
        if (path === "capture.getLogForTask") {
          return { data: null, isLoading: false };
        }
        return { data: undefined, isLoading: false };
      },
      useMutation: () => {
        if (path === "tasks.update") {
          return { mutate: mockState.taskUpdateMutate, mutateAsync: vitestVi.fn() };
        }
        if (path === "tags.create") {
          return { mutate: vitestVi.fn(), mutateAsync: mockState.tagCreateMutateAsync };
        }
        return { mutate: vitestVi.fn(), mutateAsync: vitestVi.fn(async () => ({})) };
      },
    };
  }

  const utils = {
    tasks: {
      list: { invalidate: mockState.invalidate },
      get: { invalidate: mockState.invalidate },
      counts: { invalidate: mockState.invalidate },
    },
    tags: { list: { invalidate: mockState.invalidate } },
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

// Stub subcomponents that pull in their own tRPC trees — out of scope for
// these inspector smoke tests.
vi.mock("../inbox-processing-suggestions", () => ({
  InboxProcessingSuggestions: () => null,
}));
vi.mock("../task-inspector-attachments", () => ({
  TaskInspectorAttachments: () => null,
}));
vi.mock("../task-inspector-activity-tab", () => ({
  TaskInspectorActivityTab: () => <div data-testid="activity-tab">Activity</div>,
}));
vi.mock("../task-inspector-subtasks", () => ({
  TaskInspectorSubtasks: () => null,
}));

import { TaskInspector } from "../task-inspector";

interface InspectorTaskShape {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  flagged: boolean;
  project_id: string | null;
  estimated_minutes: number | null;
  defer_date: Date | string | null;
  due_date: Date | string | null;
  contexts: { context: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string } }[];
  subtasks: { id: string; status: string; title: string }[];
  referenced_entity_refs: unknown;
}

function makeTask(overrides: Partial<InspectorTaskShape> = {}): InspectorTaskShape {
  return {
    id: "task-1",
    title: "Buy milk",
    notes: null,
    status: "active",
    flagged: false,
    project_id: null,
    estimated_minutes: null,
    defer_date: null,
    due_date: null,
    contexts: [],
    tags: [],
    subtasks: [],
    referenced_entity_refs: null,
    ...overrides,
  };
}

describe("TaskInspector", () => {
  beforeEach(() => {
    mockState.taskUpdateMutate.mockReset();
    mockState.tagCreateMutateAsync.mockReset();
    mockState.invalidate.mockReset();
    mockState.taskData = makeTask();
  });

  it("shows a loading state when the task hasn't loaded yet", () => {
    mockState.taskData = undefined;
    render(<TaskInspector taskId="task-1" />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders the task title and details tab by default", () => {
    render(<TaskInspector taskId="task-1" />);
    const titleField = screen.getByDisplayValue("Buy milk");
    expect(titleField).toBeInTheDocument();
    expect(screen.queryByTestId("activity-tab")).not.toBeInTheDocument();
  });

  it("switches to the activity tab when clicked, and back to details", () => {
    render(<TaskInspector taskId="task-1" />);
    const activityTab = screen.getByRole("button", { name: "Activity" });
    fireEvent.click(activityTab);
    expect(screen.getByTestId("activity-tab")).toBeInTheDocument();

    const detailTab = screen.getByRole("button", { name: "Details" });
    fireEvent.click(detailTab);
    expect(screen.queryByTestId("activity-tab")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Buy milk")).toBeInTheDocument();
  });

  it("fires the update mutation with the new title when the title field is edited and blurred", () => {
    render(<TaskInspector taskId="task-1" />);
    const titleField = screen.getByDisplayValue("Buy milk") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(titleField, { target: { value: "Buy oat milk" } });
      fireEvent.blur(titleField);
    });
    expect(mockState.taskUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockState.taskUpdateMutate).toHaveBeenCalledWith({
      id: "task-1",
      title: "Buy oat milk",
    });
  });

  it("does not fire the update mutation when the title is unchanged on blur", () => {
    render(<TaskInspector taskId="task-1" />);
    const titleField = screen.getByDisplayValue("Buy milk");
    fireEvent.blur(titleField);
    expect(mockState.taskUpdateMutate).not.toHaveBeenCalled();
  });

  it("fires the update mutation when the flag button is clicked", () => {
    render(<TaskInspector taskId="task-1" />);
    const flagBtn = screen.getByRole("button", { name: /Flag task/i });
    fireEvent.click(flagBtn);
    expect(mockState.taskUpdateMutate).toHaveBeenCalledWith({
      id: "task-1",
      flagged: true,
    });
  });
});

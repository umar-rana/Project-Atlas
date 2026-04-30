import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

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

interface QueryStub {
  taskData: InspectorTaskShape | undefined;
  contextsData: { id: string; name: string }[];
  tagsData: { id: string; name: string }[];
  projectsData: { id: string; title: string }[];
}

// Per-endpoint mutate/mutateAsync trackers, plus a configurable `useQuery` data
// stub. Tests poke the stub before render and assert on the recorded mutate args.
const mockState = vi.hoisted(() => ({
  mutates: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
  mutateAsyncs: new Map<string, ReturnType<typeof import("vitest").vi.fn>>(),
  queries: {
    taskData: undefined,
    contextsData: [],
    tagsData: [],
    projectsData: [],
  } as QueryStub,
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
      // tags.create needs a default that returns a fresh id so the
      // inspector's addNewTag flow can chain the subsequent tasks.update.
      const isTagCreate = path === "tags.create";
      fn = vitestVi.fn(async (args: unknown) => {
        if (isTagCreate) {
          const name =
            args && typeof args === "object" && "name" in args
              ? String((args as { name: unknown }).name)
              : "tag";
          return { id: `tag-${name}`, name };
        }
        return {};
      });
      mockState.mutateAsyncs.set(path, fn);
    }
    return fn;
  }

  function buildEndpoint(path: string) {
    return {
      useQuery: () => {
        if (path === "tasks.get") {
          return {
            data: mockState.queries.taskData,
            isLoading: mockState.queries.taskData === undefined,
          };
        }
        if (path === "projects.list") {
          return { data: mockState.queries.projectsData, isLoading: false };
        }
        if (path === "contexts.list") {
          return { data: mockState.queries.contextsData, isLoading: false };
        }
        if (path === "tags.list") {
          return { data: mockState.queries.tagsData, isLoading: false };
        }
        if (path === "capture.getLogForTask") {
          return { data: null, isLoading: false };
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

function getMutate(path: string) {
  const fn = mockState.mutates.get(path);
  if (!fn) throw new Error(`No mutate fn registered for ${path} yet`);
  return fn;
}
function getMutateAsync(path: string) {
  const fn = mockState.mutateAsyncs.get(path);
  if (!fn) throw new Error(`No mutateAsync fn registered for ${path} yet`);
  return fn;
}

describe("TaskInspector", () => {
  beforeEach(() => {
    for (const fn of mockState.mutates.values()) fn.mockClear();
    for (const fn of mockState.mutateAsyncs.values()) fn.mockClear();
    mockState.queries.taskData = makeTask();
    mockState.queries.contextsData = [];
    mockState.queries.tagsData = [];
    mockState.queries.projectsData = [];
  });

  it("shows a loading state when the task hasn't loaded yet", () => {
    mockState.queries.taskData = undefined;
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
    const updateMutate = getMutate("tasks.update");
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith({
      id: "task-1",
      title: "Buy oat milk",
    });
  });

  it("does not fire the update mutation when the title is unchanged on blur", () => {
    render(<TaskInspector taskId="task-1" />);
    const titleField = screen.getByDisplayValue("Buy milk");
    fireEvent.blur(titleField);
    const updateMutate = mockState.mutates.get("tasks.update");
    expect(updateMutate?.mock.calls.length ?? 0).toBe(0);
  });

  it("fires the update mutation when the flag button is clicked", () => {
    render(<TaskInspector taskId="task-1" />);
    const flagBtn = screen.getByRole("button", { name: /Flag task/i });
    fireEvent.click(flagBtn);
    const updateMutate = getMutate("tasks.update");
    expect(updateMutate).toHaveBeenCalledWith({
      id: "task-1",
      flagged: true,
    });
  });

  describe("contexts section", () => {
    it("toggling an unselected context fires tasks.update with the new context_ids list", () => {
      mockState.queries.contextsData = [
        { id: "ctx-home", name: "home" },
        { id: "ctx-office", name: "office" },
      ];
      render(<TaskInspector taskId="task-1" />);
      const homeBtn = screen.getByRole("button", { name: "@home" });
      fireEvent.click(homeBtn);
      const updateMutate = getMutate("tasks.update");
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({
        id: "task-1",
        context_ids: ["ctx-home"],
      });
    });

    it("toggling an already-selected context removes it from the context_ids list", () => {
      mockState.queries.contextsData = [
        { id: "ctx-home", name: "home" },
        { id: "ctx-office", name: "office" },
      ];
      mockState.queries.taskData = makeTask({
        contexts: [
          { context: { id: "ctx-home", name: "home" } },
          { context: { id: "ctx-office", name: "office" } },
        ],
      });
      render(<TaskInspector taskId="task-1" />);
      const officeBtn = screen.getByRole("button", { name: "@office" });
      fireEvent.click(officeBtn);
      const updateMutate = getMutate("tasks.update");
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({
        id: "task-1",
        context_ids: ["ctx-home"],
      });
    });
  });

  describe("tags section — '#add tag' input", () => {
    it("creates a brand new tag and then patches the task with the new tag id", async () => {
      // Empty tag list → addNewTag falls through to tags.create then tasks.update.
      mockState.queries.tagsData = [];
      render(<TaskInspector taskId="task-1" />);
      const tagInput = screen.getByPlaceholderText("#add tag") as HTMLInputElement;
      await act(async () => {
        fireEvent.change(tagInput, { target: { value: "errand" } });
        fireEvent.keyDown(tagInput, { key: "Enter" });
        // Let the awaited mutateAsync resolve.
        await Promise.resolve();
        await Promise.resolve();
      });
      const tagCreateAsync = getMutateAsync("tags.create");
      expect(tagCreateAsync).toHaveBeenCalledTimes(1);
      expect(tagCreateAsync).toHaveBeenCalledWith({ name: "errand" });

      const updateMutate = getMutate("tasks.update");
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({
        id: "task-1",
        tag_ids: ["tag-errand"],
      });
    });

    it("reuses an existing tag id when the typed name already exists (no tags.create)", async () => {
      mockState.queries.tagsData = [{ id: "tag-existing", name: "errand" }];
      render(<TaskInspector taskId="task-1" />);
      const tagInput = screen.getByPlaceholderText("#add tag") as HTMLInputElement;
      await act(async () => {
        fireEvent.change(tagInput, { target: { value: "#errand" } });
        fireEvent.keyDown(tagInput, { key: "Enter" });
        await Promise.resolve();
      });
      const tagCreateAsync = mockState.mutateAsyncs.get("tags.create");
      expect(tagCreateAsync?.mock.calls.length ?? 0).toBe(0);

      const updateMutate = getMutate("tasks.update");
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({
        id: "task-1",
        tag_ids: ["tag-existing"],
      });
    });

    it("does nothing when the input is empty on Enter", async () => {
      render(<TaskInspector taskId="task-1" />);
      const tagInput = screen.getByPlaceholderText("#add tag") as HTMLInputElement;
      await act(async () => {
        fireEvent.keyDown(tagInput, { key: "Enter" });
        await Promise.resolve();
      });
      expect(mockState.mutateAsyncs.get("tags.create")?.mock.calls.length ?? 0).toBe(0);
      expect(mockState.mutates.get("tasks.update")?.mock.calls.length ?? 0).toBe(0);
    });
  });

  describe("defer date display", () => {
    it("renders the defer date field with label 'Available from' instead of 'Defer'", () => {
      render(<TaskInspector taskId="task-1" />);
      expect(screen.getByText("Available from")).toBeInTheDocument();
      expect(screen.queryByText("Defer")).not.toBeInTheDocument();
    });

    it("shows no deferred callout when defer_date is null", () => {
      mockState.queries.taskData = makeTask({ defer_date: null });
      render(<TaskInspector taskId="task-1" />);
      expect(screen.queryByText(/Available from/i, { selector: "span" })).not.toBeInTheDocument();
    });

    it("shows the deferred callout with formatted date when defer_date is in the future", () => {
      const futureDate = new Date("2099-06-15T12:00:00");
      mockState.queries.taskData = makeTask({ defer_date: futureDate });
      render(<TaskInspector taskId="task-1" />);
      expect(screen.getByText("June 15, 2099")).toBeInTheDocument();
    });

    it("does not show the deferred callout when defer_date is in the past", () => {
      const pastDate = new Date("2020-01-01");
      mockState.queries.taskData = makeTask({ defer_date: pastDate });
      render(<TaskInspector taskId="task-1" />);
      expect(screen.queryByText("January 1, 2020")).not.toBeInTheDocument();
    });
  });

  describe("trash variant footer", () => {
    it("'Restore' fires tasks.restore with the task id", () => {
      const { container } = render(<TaskInspector taskId="task-1" inTrash />);
      const restoreBtn = within(container).getByRole("button", { name: /Restore/i });
      fireEvent.click(restoreBtn);
      const restoreMutate = getMutate("tasks.restore");
      expect(restoreMutate).toHaveBeenCalledTimes(1);
      expect(restoreMutate).toHaveBeenCalledWith({ id: "task-1" });
    });

    it("'Delete forever' confirms then fires tasks.hardDelete", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { container } = render(<TaskInspector taskId="task-1" inTrash />);
      const deleteBtn = within(container).getByRole("button", { name: /Delete forever/i });
      fireEvent.click(deleteBtn);
      expect(confirmSpy).toHaveBeenCalled();
      const hardDeleteMutate = getMutate("tasks.hardDelete");
      expect(hardDeleteMutate).toHaveBeenCalledTimes(1);
      expect(hardDeleteMutate).toHaveBeenCalledWith({ id: "task-1" });
      confirmSpy.mockRestore();
    });

    it("'Delete forever' is a no-op when the user cancels the confirm dialog", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { container } = render(<TaskInspector taskId="task-1" inTrash />);
      const deleteBtn = within(container).getByRole("button", { name: /Delete forever/i });
      fireEvent.click(deleteBtn);
      expect(mockState.mutates.get("tasks.hardDelete")?.mock.calls.length ?? 0).toBe(0);
      confirmSpy.mockRestore();
    });
  });
});

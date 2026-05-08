import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockChecklistDeleteMany = vi.fn();
const mockWorkLogDeleteMany = vi.fn();
const mockTaskUpdateMany = vi.fn();
const mockTaskDeleteMany = vi.fn();
const mockProjectDeleteMany = vi.fn();
const mockNoteDeleteMany = vi.fn();
const mockNotesFolderDeleteMany = vi.fn();
const mockProjectFolderDeleteMany = vi.fn();
const mockCaptureDeleteMany = vi.fn();
const mockTagDeleteMany = vi.fn();
const mockContextDeleteMany = vi.fn();
const mockAttachmentDeleteMany = vi.fn();
const mockTableColumnDeleteMany = vi.fn();
const mockTableRowDeleteMany = vi.fn();
const mockTableDeleteMany = vi.fn();
const mockTablesFolderDeleteMany = vi.fn();
const mockTaskTemplateDeleteMany = vi.fn();

vi.mock("@/core/db", () => ({
  db: {
    checklistItem: { deleteMany: (...a: unknown[]) => mockChecklistDeleteMany(...a) },
    taskWorkLog: { deleteMany: (...a: unknown[]) => mockWorkLogDeleteMany(...a) },
    task: {
      updateMany: (...a: unknown[]) => mockTaskUpdateMany(...a),
      deleteMany: (...a: unknown[]) => mockTaskDeleteMany(...a),
    },
    project: { deleteMany: (...a: unknown[]) => mockProjectDeleteMany(...a) },
    note: { deleteMany: (...a: unknown[]) => mockNoteDeleteMany(...a) },
    notesFolder: { deleteMany: (...a: unknown[]) => mockNotesFolderDeleteMany(...a) },
    projectFolder: { deleteMany: (...a: unknown[]) => mockProjectFolderDeleteMany(...a) },
    capture: { deleteMany: (...a: unknown[]) => mockCaptureDeleteMany(...a) },
    tag: { deleteMany: (...a: unknown[]) => mockTagDeleteMany(...a) },
    context: { deleteMany: (...a: unknown[]) => mockContextDeleteMany(...a) },
    attachment: { deleteMany: (...a: unknown[]) => mockAttachmentDeleteMany(...a) },
    tableColumn: { deleteMany: (...a: unknown[]) => mockTableColumnDeleteMany(...a) },
    tableRow: { deleteMany: (...a: unknown[]) => mockTableRowDeleteMany(...a) },
    table: { deleteMany: (...a: unknown[]) => mockTableDeleteMany(...a) },
    tablesFolder: { deleteMany: (...a: unknown[]) => mockTablesFolderDeleteMany(...a) },
    taskTemplate: { deleteMany: (...a: unknown[]) => mockTaskTemplateDeleteMany(...a) },
  },
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleTrashRetention } from "./trash-retention";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: every deleteMany returns count: 0
  for (const fn of [
    mockChecklistDeleteMany,
    mockWorkLogDeleteMany,
    mockTaskDeleteMany,
    mockProjectDeleteMany,
    mockNoteDeleteMany,
    mockNotesFolderDeleteMany,
    mockProjectFolderDeleteMany,
    mockCaptureDeleteMany,
    mockTagDeleteMany,
    mockContextDeleteMany,
    mockAttachmentDeleteMany,
    mockTableColumnDeleteMany,
    mockTableRowDeleteMany,
    mockTableDeleteMany,
    mockTablesFolderDeleteMany,
    mockTaskTemplateDeleteMany,
  ]) {
    fn.mockResolvedValue({ count: 0 });
  }
  mockTaskUpdateMany.mockResolvedValue({ count: 0 });
});

describe("handleTrashRetention", () => {
  it("uses a 30-day cutoff and applies it to every soft-delete table", async () => {
    const before = Date.now();
    await handleTrashRetention();
    const after = Date.now();

    // Every deleteMany call must filter on deleted_at < cutoff (and not null)
    const tables = [
      mockChecklistDeleteMany,
      mockWorkLogDeleteMany,
      mockTaskDeleteMany,
      mockProjectDeleteMany,
      mockNoteDeleteMany,
      mockNotesFolderDeleteMany,
      mockProjectFolderDeleteMany,
      mockTagDeleteMany,
      mockContextDeleteMany,
      mockAttachmentDeleteMany,
      mockTableColumnDeleteMany,
      mockTableRowDeleteMany,
      mockTableDeleteMany,
      mockTablesFolderDeleteMany,
      mockTaskTemplateDeleteMany,
    ];

    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;

    for (const fn of tables) {
      expect(fn).toHaveBeenCalledOnce();
      const arg = fn.mock.calls[0]![0] as {
        where: { deleted_at: { lt: Date; not: null } };
      };
      expect(arg.where.deleted_at.not).toBeNull();
      expect(arg.where.deleted_at.lt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(arg.where.deleted_at.lt.getTime()).toBeLessThanOrEqual(expectedMax);
    }
  });

  it("nulls subtask parent_id before purging tasks (cascade safety)", async () => {
    await handleTrashRetention();

    // updateMany must run and must run BEFORE task.deleteMany
    expect(mockTaskUpdateMany).toHaveBeenCalledOnce();
    const updateArg = mockTaskUpdateMany.mock.calls[0]![0] as {
      data: { parent_id: null };
      where: { deleted_at: null };
    };
    expect(updateArg.data.parent_id).toBeNull();
    expect(updateArg.where.deleted_at).toBeNull();

    // The two calls' invocation order — updateMany should fire before deleteMany
    const updateOrder = mockTaskUpdateMany.mock.invocationCallOrder[0]!;
    const deleteOrder = mockTaskDeleteMany.mock.invocationCallOrder[0]!;
    expect(updateOrder).toBeLessThan(deleteOrder);
  });

  it("excludes processed captures from the purge (separate job handles those)", async () => {
    await handleTrashRetention();

    expect(mockCaptureDeleteMany).toHaveBeenCalledOnce();
    const arg = mockCaptureDeleteMany.mock.calls[0]![0] as {
      where: { state: { not: string } };
    };
    expect(arg.where.state).toEqual({ not: "processed" });
  });

  it("returns counts summed from each table's deleteMany result", async () => {
    mockChecklistDeleteMany.mockResolvedValue({ count: 3 });
    mockTaskDeleteMany.mockResolvedValue({ count: 7 });
    mockNoteDeleteMany.mockResolvedValue({ count: 2 });
    mockTagDeleteMany.mockResolvedValue({ count: 5 });

    const result = await handleTrashRetention();

    expect(result.checklistItems).toBe(3);
    expect(result.tasks).toBe(7);
    expect(result.notes).toBe(2);
    expect(result.tags).toBe(5);
    expect(result.errors).toEqual([]);
  });

  it("isolates errors — one table failing does not stop the others", async () => {
    mockTaskDeleteMany.mockRejectedValue(new Error("DB connection lost"));
    mockNoteDeleteMany.mockResolvedValue({ count: 4 });
    mockTagDeleteMany.mockResolvedValue({ count: 1 });

    const result = await handleTrashRetention();

    // The failing table contributes nothing but doesn't poison anything else
    expect(result.tasks).toBe(0);
    expect(result.notes).toBe(4);
    expect(result.tags).toBe(1);
    expect(result.errors).toContain("tasks: DB connection lost");

    // Subsequent tables must still have been called
    expect(mockTagDeleteMany).toHaveBeenCalledOnce();
    expect(mockTaskTemplateDeleteMany).toHaveBeenCalledOnce();
  });

  it("collects all errors when multiple tables fail", async () => {
    mockTaskDeleteMany.mockRejectedValue(new Error("err1"));
    mockNoteDeleteMany.mockRejectedValue(new Error("err2"));
    mockTagDeleteMany.mockRejectedValue("non-error string");

    const result = await handleTrashRetention();

    expect(result.errors).toHaveLength(3);
    expect(result.errors).toContain("tasks: err1");
    expect(result.errors).toContain("notes: err2");
    expect(result.errors).toContain("tags: non-error string");
  });
});

import { describe, it, expect } from "vitest";
import { categorizeInboxTask } from "../inbox-migration";
import type { InboxTaskForClassification } from "../inbox-migration";

function makeTask(overrides: Partial<InboxTaskForClassification> = {}): InboxTaskForClassification {
  return {
    id: "task-1",
    title: "Buy groceries",
    notes: null,
    flagged: false,
    due_date: null,
    defer_date: null,
    estimated_minutes: null,
    contexts: [],
    tags: [],
    checklist_items: [],
    subtasks: [],
    auditActions: ["task_created"],
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("categorizeInboxTask", () => {
  describe("Category A (safe to migrate)", () => {
    it("classifies a bare task with no metadata as A", () => {
      expect(categorizeInboxTask(makeTask())).toBe("A");
    });

    it("classifies task with only system audit actions as A", () => {
      expect(
        categorizeInboxTask(
          makeTask({
            auditActions: [
              "task_created",
              "capture_parsed",
              "task_parsed_local_only",
              "task_parsed_with_ai",
              "task_parsed_fallback",
              "capture_created",
            ],
          }),
        ),
      ).toBe("A");
    });

    it("classifies task where notes equals title as A", () => {
      expect(
        categorizeInboxTask(makeTask({ notes: "Buy groceries", title: "Buy groceries" })),
      ).toBe("A");
    });

    it("classifies task with empty notes string as A", () => {
      expect(categorizeInboxTask(makeTask({ notes: "   " }))).toBe("A");
    });
  });

  describe("Category B (keep as Task)", () => {
    it("classifies flagged task as B", () => {
      expect(categorizeInboxTask(makeTask({ flagged: true }))).toBe("B");
    });

    it("classifies task with due_date as B", () => {
      expect(categorizeInboxTask(makeTask({ due_date: new Date() }))).toBe("B");
    });

    it("classifies task with defer_date as B", () => {
      expect(categorizeInboxTask(makeTask({ defer_date: new Date() }))).toBe("B");
    });

    it("classifies task with estimated_minutes > 0 as B", () => {
      expect(categorizeInboxTask(makeTask({ estimated_minutes: 30 }))).toBe("B");
    });

    it("classifies task with contexts as B", () => {
      expect(categorizeInboxTask(makeTask({ contexts: [{ context_id: "ctx-1" }] }))).toBe("B");
    });

    it("classifies task with tags as B", () => {
      expect(categorizeInboxTask(makeTask({ tags: [{ tag_id: "tag-1" }] }))).toBe("B");
    });

    it("classifies task with checklist items as B", () => {
      expect(categorizeInboxTask(makeTask({ checklist_items: [{ id: "ci-1" }] }))).toBe("B");
    });

    it("classifies task with subtasks as B", () => {
      expect(categorizeInboxTask(makeTask({ subtasks: [{ id: "sub-1" }] }))).toBe("B");
    });

    it("classifies task with meaningful notes as B", () => {
      expect(categorizeInboxTask(makeTask({ notes: "Call the store to check stock first" }))).toBe(
        "B",
      );
    });

    it("classifies task with user edit action as B", () => {
      expect(
        categorizeInboxTask(makeTask({ auditActions: ["task_created", "task_updated"] })),
      ).toBe("B");
    });

    it("classifies task with user project assignment as B", () => {
      expect(
        categorizeInboxTask(makeTask({ auditActions: ["task_created", "task_project_assigned"] })),
      ).toBe("B");
    });

    it("defaults to B when estimated_minutes is 0 (falsy) — zero is not meaningful work", () => {
      expect(categorizeInboxTask(makeTask({ estimated_minutes: 0 }))).toBe("A");
    });
  });

  describe("edge cases", () => {
    it("classifies task with null estimated_minutes as A", () => {
      expect(categorizeInboxTask(makeTask({ estimated_minutes: null }))).toBe("A");
    });

    it("classifies task with empty audit actions as A (no user activity)", () => {
      expect(categorizeInboxTask(makeTask({ auditActions: [] }))).toBe("A");
    });

    it("always keeps tasks with any meaningful data when uncertain", () => {
      expect(
        categorizeInboxTask(
          makeTask({
            notes: "Details here",
            contexts: [{ context_id: "ctx-1" }],
          }),
        ),
      ).toBe("B");
    });
  });
});

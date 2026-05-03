import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const mockTagFindFirst = vi.fn();
const mockTagCreate = vi.fn();
const mockTagFindMany = vi.fn();
const mockTagUpdateMany = vi.fn();
const mockTagOnTaskCreateMany = vi.fn();
const mockContextFindFirst = vi.fn();
const mockContextCreate = vi.fn();
const mockContextOnTaskCreateMany = vi.fn();
const mockTaskCreate = vi.fn();
const mockTaskUpdate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockProjectFindMany = vi.fn();
const mockProjectFindFirst = vi.fn();
const mockCaptureParseLogCreate = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock("@/core/db", () => ({
  db: {
    tag: {
      findFirst: (...args: unknown[]) => mockTagFindFirst(...args),
      create: (...args: unknown[]) => mockTagCreate(...args),
      findMany: (...args: unknown[]) => mockTagFindMany(...args),
      updateMany: (...args: unknown[]) => mockTagUpdateMany(...args),
    },
    tagOnTask: {
      createMany: (...args: unknown[]) => mockTagOnTaskCreateMany(...args),
    },
    context: {
      findFirst: (...args: unknown[]) => mockContextFindFirst(...args),
      create: (...args: unknown[]) => mockContextCreate(...args),
    },
    contextOnTask: {
      createMany: (...args: unknown[]) => mockContextOnTaskCreateMany(...args),
    },
    task: {
      create: (...args: unknown[]) => mockTaskCreate(...args),
      update: (...args: unknown[]) => mockTaskUpdate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    project: {
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    captureParseLog: {
      create: (...args: unknown[]) => mockCaptureParseLogCreate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
  newId: () => "test-id-000",
}));

// ─── Mock AI ────────────────────────────────────────────────────────────────

vi.mock("@/core/ai", () => ({
  complete: vi.fn(),
}));

vi.mock("@/core/ai/limits", () => ({
  checkCaptureParseLimits: async () => ({ allowed: true }),
  CAPTURE_PARSE_MODEL: "claude-test",
  CAPTURE_PARSE_LIMITS: { maxInputTokens: 10000 },
}));

vi.mock("@/prompts/capture-parse/v1", () => ({
  CAPTURE_PARSE_SYSTEM_PROMPT: "test prompt",
  buildCaptureParseUserMessage: () => "user message",
}));

vi.mock("@/core/capture/enrichment-queue", () => ({
  enqueueEnrichment: (fn: () => Promise<void>) => fn(),
}));

// ─── classifyParsedTags tests ─────────────────────────────────────────────

import { classifyParsedTags } from "./service";

describe("classifyParsedTags — integration-level contract", () => {
  it("routes explicit tags to autoApply regardless of library state", () => {
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["work", "personal", "cooking"],
      new Set(["work", "personal"]),
      new Set<string>(),
    );
    expect(autoApply).toContain("work");
    expect(autoApply).toContain("personal");
    expect(suggestedNew).toContain("cooking");
    expect(suggestedNew).not.toContain("work");
    expect(suggestedNew).not.toContain("personal");
  });

  it("routes AI tags that exist in library to autoApply", () => {
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["existing-tag", "new-tag"],
      new Set<string>(),
      new Set(["existing-tag"]),
    );
    expect(autoApply).toContain("existing-tag");
    expect(suggestedNew).toContain("new-tag");
  });

  it("routes AI tags that do not exist to suggestedNew (never autoApply)", () => {
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["cooking", "recipes", "health"],
      new Set<string>(),
      new Set<string>(),
    );
    expect(autoApply).toHaveLength(0);
    expect(suggestedNew).toHaveLength(3);
  });
});

// ─── AI enrichment path — tag gating ─────────────────────────────────────

describe("captureAndCreate — AI enrichment tag gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({
      timezone: "UTC",
      ai_confidence_threshold: 0.3, // Low threshold → AI always triggered
      tasks_prefs: {},
    });
    mockProjectFindMany.mockResolvedValue([]);
    mockProjectFindFirst.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({ id: "task-id" });
    mockTaskUpdate.mockResolvedValue({ id: "task-id" });
    mockCaptureParseLogCreate.mockResolvedValue({ id: "log-id" });
    mockAuditLogCreate.mockResolvedValue({});
    mockTagOnTaskCreateMany.mockResolvedValue({});
    mockTagUpdateMany.mockResolvedValue({});
    mockContextOnTaskCreateMany.mockResolvedValue({});
    mockContextFindFirst.mockResolvedValue(null);
    mockContextCreate.mockResolvedValue({ id: "ctx-id" });
  });

  it("does NOT call tag.create for AI-suggested tags that do not exist in library", async () => {
    const { complete } = await import("@/core/ai");
    vi.mocked(complete).mockResolvedValue({
      content: JSON.stringify({
        title: "Make pasta for dinner",
        tags: ["cooking", "dinner"],
      }),
      model: "claude-test" as never,
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
      durationMs: 100,
    });

    // No existing tags in library — both are AI-suggested new
    mockTagFindMany.mockResolvedValue([]);
    mockTagFindFirst.mockResolvedValue(null);

    const { captureAndCreate } = await import("./service");
    await captureAndCreate({
      rawText: "make pasta for dinner",
      userId: "user-id",
      source: "modal",
    });

    // tag.create must NOT have been called (no tag.create for AI-new tags)
    expect(mockTagCreate).not.toHaveBeenCalled();
  });

  it("calls tag.create for explicit #tag syntax even when AI agrees", async () => {
    const { complete } = await import("@/core/ai");
    vi.mocked(complete).mockResolvedValue({
      content: JSON.stringify({
        title: "Buy groceries",
        tags: ["groceries"],
      }),
      model: "claude-test" as never,
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
      durationMs: 100,
    });

    // The tag doesn't exist yet in the library
    mockTagFindMany.mockResolvedValue([]);
    mockTagFindFirst.mockResolvedValue(null);
    mockTagCreate.mockResolvedValue({ id: "tag-id", name: "groceries" });

    const { captureAndCreate } = await import("./service");
    await captureAndCreate({
      rawText: "buy milk #groceries",
      userId: "user-id",
      source: "modal",
    });

    // "groceries" was explicit via #tag syntax → tag.create IS called
    expect(mockTagCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "groceries" }),
      }),
    );
  });

  it("auto-applies AI tags that already exist in library without creating new ones", async () => {
    const { complete } = await import("@/core/ai");
    vi.mocked(complete).mockResolvedValue({
      content: JSON.stringify({
        title: "Exercise routine",
        tags: ["fitness", "brandnew"],
      }),
      model: "claude-test" as never,
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
      durationMs: 100,
    });

    // "fitness" exists in library, "brandnew" does not
    mockTagFindMany.mockResolvedValue([{ name: "fitness" }]);
    // findFirst used by linkTagsAndContexts for "fitness" tag
    mockTagFindFirst.mockImplementation(({ where }: { where: { name?: string } }) => {
      if (where.name === "fitness") return Promise.resolve({ id: "fitness-id", name: "fitness" });
      return Promise.resolve(null);
    });

    const { captureAndCreate } = await import("./service");
    await captureAndCreate({
      rawText: "exercise routine",
      userId: "user-id",
      source: "modal",
    });

    // "fitness" is auto-applied (findFirst found it, no create needed)
    // "brandnew" should NOT have triggered a create call
    const createCalls = mockTagCreate.mock.calls;
    const createdNames = createCalls.map((call) => (call[0] as { data: { name: string } }).data?.name);
    expect(createdNames).not.toContain("brandnew");
  });
});

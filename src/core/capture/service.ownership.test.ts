import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const mockTagFindFirst = vi.fn();
const mockTagCreate = vi.fn();
const mockTagFindMany = vi.fn();
const mockTagUpdateMany = vi.fn();
const mockTagOnTaskCreateMany = vi.fn();
const mockContextFindFirst = vi.fn();
const mockContextFindMany = vi.fn();
const mockContextCreate = vi.fn();
const mockContextOnTaskCreateMany = vi.fn();
const mockTaskCreate = vi.fn();
const mockTaskUpdate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockProjectFindMany = vi.fn();
const mockProjectFindFirst = vi.fn();
const mockCaptureParseLogCreate = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockCaptureCreate = vi.fn();
const mockCaptureUpdate = vi.fn();

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
      findMany: (...args: unknown[]) => mockContextFindMany(...args),
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
    capture: {
      create: (...args: unknown[]) => mockCaptureCreate(...args),
      update: (...args: unknown[]) => mockCaptureUpdate(...args),
    },
  },
  newId: () => "test-id-000",
}));

// ─── Mock AI ─────────────────────────────────────────────────────────────────

const mockComplete = vi.fn();

vi.mock("@/core/ai", () => ({
  complete: (...args: unknown[]) => mockComplete(...args),
}));

vi.mock("@/core/ai/limits", () => ({
  checkCaptureParseLimits: async () => ({ allowed: true }),
  CAPTURE_PARSE_MODEL: "claude-test",
  CAPTURE_PARSE_LIMITS: { maxInputTokens: 2000 },
}));

const mockBuildUserMessage = vi.fn();

vi.mock("@/prompts/capture-parse/v1", () => ({
  CAPTURE_PARSE_SYSTEM_PROMPT: "test prompt",
  buildCaptureParseUserMessage: (...args: unknown[]) => mockBuildUserMessage(...args),
}));

vi.mock("@/core/capture/enrichment-queue", () => ({
  enqueueEnrichment: (fn: () => Promise<void>) => fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHORT_USER_MESSAGE = "user message";
const LONG_USER_MESSAGE = "x".repeat(8000);

function setupBaseDb() {
  mockUserFindUnique.mockResolvedValue({
    timezone: "UTC",
    ai_confidence_threshold: 0.9,
    tasks_prefs: {},
  });
  mockProjectFindMany.mockResolvedValue([]);
  mockProjectFindFirst.mockResolvedValue(null);
  mockTaskCreate.mockResolvedValue({ id: "task-id" });
  mockTaskUpdate.mockResolvedValue({ id: "task-id" });
  mockCaptureParseLogCreate.mockResolvedValue({ id: "log-id" });
  mockAuditLogCreate.mockResolvedValue({});
  mockTagFindMany.mockResolvedValue([]);
  mockTagOnTaskCreateMany.mockResolvedValue({});
  mockTagUpdateMany.mockResolvedValue({});
  mockContextOnTaskCreateMany.mockResolvedValue({});
  mockContextFindFirst.mockResolvedValue(null);
  mockContextFindMany.mockResolvedValue([]);
  mockContextCreate.mockResolvedValue({ id: "ctx-id" });
  mockCaptureCreate.mockResolvedValue({ id: "capture-id" });
  mockCaptureUpdate.mockResolvedValue({ id: "capture-id" });
}

// ─── Ownership violation tests ────────────────────────────────────────────────

describe("captureAndCreate — ownership validation (projectIdOverride)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseDb();
    mockBuildUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("throws when projectIdOverride does not belong to the user", async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "buy milk",
        userId: "user-a",
        source: "modal",
        projectIdOverride: "project-belonging-to-user-b",
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("throws when projectIdOverride is soft-deleted", async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "buy milk",
        userId: "user-a",
        source: "modal",
        projectIdOverride: "deleted-project-id",
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("does NOT throw when projectIdOverride is valid and owned by the user", async () => {
    mockProjectFindFirst.mockResolvedValue({ id: "my-project-id" });
    mockComplete.mockRejectedValue(new Error("AI unavailable"));

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "buy milk",
        userId: "user-a",
        source: "modal",
        projectIdOverride: "my-project-id",
      }),
    ).resolves.toBeDefined();
  });
});

describe("captureAndCreate — ownership validation (contextIdOverrides)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseDb();
    mockBuildUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("throws when any contextIdOverride is not owned by the user", async () => {
    mockContextFindMany.mockResolvedValue([{ id: "ctx-1" }]);

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "meeting",
        userId: "user-a",
        source: "modal",
        contextIdOverrides: ["ctx-1", "ctx-not-mine"],
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("throws when contextIdOverrides list returns no rows (all unowned)", async () => {
    mockContextFindMany.mockResolvedValue([]);

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "meeting",
        userId: "user-a",
        source: "modal",
        contextIdOverrides: ["ctx-other-user"],
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("does NOT throw when all contextIdOverrides are owned by the user", async () => {
    mockContextFindMany.mockResolvedValue([{ id: "ctx-mine" }]);
    mockComplete.mockRejectedValue(new Error("AI unavailable"));

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "meeting",
        userId: "user-a",
        source: "modal",
        contextIdOverrides: ["ctx-mine"],
      }),
    ).resolves.toBeDefined();
  });
});

describe("captureAndCreate — ownership validation (tagIdOverrides)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseDb();
    mockBuildUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("throws when any tagIdOverride is not owned by the user", async () => {
    mockTagFindMany.mockImplementation(
      ({ where }: { where?: { id?: { in?: string[] }; name?: unknown } }) => {
        if (where?.id?.in) {
          const ids = where.id.in;
          if (ids.includes("tag-not-mine")) return Promise.resolve([{ id: "tag-mine" }]);
        }
        return Promise.resolve([]);
      },
    );

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "buy milk",
        userId: "user-a",
        source: "modal",
        tagIdOverrides: ["tag-mine", "tag-not-mine"],
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("throws when tagIdOverrides list returns no rows (all unowned)", async () => {
    mockTagFindMany.mockResolvedValue([]);

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "buy milk",
        userId: "user-a",
        source: "modal",
        tagIdOverrides: ["tag-other-user"],
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("does NOT throw when all tagIdOverrides are owned by the user", async () => {
    mockTagFindMany.mockImplementation(
      ({ where }: { where?: { id?: { in?: string[] }; name?: unknown } }) => {
        if (where?.id?.in) {
          return Promise.resolve(where.id.in.map((id: string) => ({ id })));
        }
        return Promise.resolve([]);
      },
    );
    mockComplete.mockRejectedValue(new Error("AI unavailable"));

    const { captureAndCreate } = await import("./service");
    await expect(
      captureAndCreate({
        rawText: "buy milk",
        userId: "user-a",
        source: "modal",
        tagIdOverrides: ["tag-mine"],
      }),
    ).resolves.toBeDefined();
  });
});

// ─── Helpers for async enrichment flush ──────────────────────────────────────

function flushEnrichmentQueue(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ─── Tier 2 error → Tier 1 preservation ──────────────────────────────────────

describe("captureAndCreate — Tier 2 error → Tier 1 preservation (not raw fallback)", () => {
  const RAW_TEXT = "call dentist";

  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseDb();
    mockBuildUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("initial task create uses Tier 1 title when AI will fail", async () => {
    mockComplete.mockRejectedValue(new Error("network timeout"));

    const { captureAndCreate } = await import("./service");
    const result = await captureAndCreate({
      rawText: RAW_TEXT,
      userId: "user-id",
      source: "modal",
    });

    expect(result).toBeDefined();
    const createCall = mockCaptureCreate.mock.calls[0]?.[0] as { data: { title: string } } | undefined;
    expect(createCall?.data.title).toBe("call dentist");
  });

  it("updates task with Tier 1 title and logs local_only when AI returns unparseable content", async () => {
    mockComplete.mockResolvedValue({
      content: "I am not JSON",
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { captureAndCreate } = await import("./service");
    await captureAndCreate({
      rawText: RAW_TEXT,
      userId: "user-id",
      source: "modal",
    });
    await flushEnrichmentQueue();

    const updateCall = mockCaptureUpdate.mock.calls[0]?.[0] as { data: { title: string } } | undefined;
    expect(updateCall?.data.title).toBe("call dentist");

    const parseLogCall = mockCaptureParseLogCreate.mock.calls[0]?.[0] as
      | { data: { parse_tier: string; ai_used: boolean } }
      | undefined;
    expect(parseLogCall?.data.parse_tier).toBe("local_only");
    expect(parseLogCall?.data.ai_used).toBe(false);
  });

  it("logs local_only (not local_plus_ai) when AI call throws", async () => {
    mockComplete.mockRejectedValue(new Error("AI unavailable"));

    const { captureAndCreate } = await import("./service");
    await captureAndCreate({
      rawText: RAW_TEXT,
      userId: "user-id",
      source: "modal",
    });
    await flushEnrichmentQueue();

    const allLogCalls = mockCaptureParseLogCreate.mock.calls as Array<
      [{ data: { parse_tier: string } }]
    >;
    const tiers = allLogCalls.map((call) => call[0]?.data?.parse_tier);
    expect(tiers).not.toContain("local_plus_ai");
    expect(tiers).toContain("local_only");
  });
});

// ─── Token cap end-to-end through captureAndCreate ───────────────────────────

describe("captureAndCreate — Tier 2 token cap → Tier 1 preserved end-to-end", () => {
  const RAW_TEXT = "call dentist";

  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseDb();
  });

  it("skips AI call and preserves Tier 1 data when input exceeds token cap", async () => {
    mockBuildUserMessage.mockReturnValue(LONG_USER_MESSAGE);

    const { captureAndCreate } = await import("./service");
    await captureAndCreate({
      rawText: RAW_TEXT,
      userId: "user-id",
      source: "modal",
    });
    await flushEnrichmentQueue();

    expect(mockComplete).not.toHaveBeenCalled();

    const parseLogCall = mockCaptureParseLogCreate.mock.calls[0]?.[0] as
      | { data: { parse_tier: string; ai_used: boolean; title: string } }
      | undefined;
    expect(parseLogCall?.data.parse_tier).toBe("local_only");
    expect(parseLogCall?.data.ai_used).toBe(false);
    expect(parseLogCall?.data.title).toBe("call dentist");

    const updateCall = mockCaptureUpdate.mock.calls[0]?.[0] as { data: { title: string } } | undefined;
    expect(updateCall?.data.title).toBe("call dentist");
  });
});

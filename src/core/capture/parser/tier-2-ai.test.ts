import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PartialParse } from "./types";

const mockComplete = vi.fn();
const mockCheckCaptureParseLimits = vi.fn();
const mockBuildCaptureParseUserMessage = vi.fn();

vi.mock("@/core/ai", () => ({
  complete: (...args: unknown[]) => mockComplete(...args),
}));

vi.mock("@/core/ai/limits", () => ({
  checkCaptureParseLimits: (...args: unknown[]) => mockCheckCaptureParseLimits(...args),
  CAPTURE_PARSE_MODEL: "claude-test",
  CAPTURE_PARSE_LIMITS: { maxInputTokens: 2000 },
}));

vi.mock("@/prompts/capture-parse/v1", () => ({
  CAPTURE_PARSE_SYSTEM_PROMPT: "system",
  buildCaptureParseUserMessage: (...args: unknown[]) => mockBuildCaptureParseUserMessage(...args),
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makePartial(overrides: Partial<PartialParse> = {}): PartialParse {
  return {
    title: "draft title",
    tags: [],
    contexts: [],
    due_date: undefined,
    defer_date: undefined,
    project_hint: undefined,
    person_refs: [],
    entity_refs: [],
    flagged: false,
    urgency_signals: [],
    ...overrides,
  };
}

const ALLOWED = { allowed: true };

const SHORT_USER_MESSAGE = "user message";
const LONG_USER_MESSAGE = "x".repeat(8000);

describe("runTier2 — token cap enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("returns parsed: null when estimated input tokens exceed 2000 cap", async () => {
    mockBuildCaptureParseUserMessage.mockReturnValue(LONG_USER_MESSAGE);

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("buy groceries", makePartial(), "user-id");

    expect(result.parsed).toBeNull();
    expect(result.error).toMatch(/token/i);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("does NOT trigger the cap for a short message (sanity check)", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Buy groceries" }),
      model: "claude-test",
      inputTokens: 5,
      outputTokens: 3,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("buy groceries", makePartial(), "user-id");

    expect(mockComplete).toHaveBeenCalled();
    expect(result.parsed).not.toBeNull();
  });
});

describe("runTier2 — limit check gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("returns parsed: null immediately when limit check disallows", async () => {
    mockCheckCaptureParseLimits.mockResolvedValue({
      allowed: false,
      reason: "Daily limit reached",
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed).toBeNull();
    expect(result.error).toBe("Daily limit reached");
    expect(mockComplete).not.toHaveBeenCalled();
  });
});

describe("runTier2 — AI error → parsed: null (Tier 1 preserved by caller)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("returns parsed: null when AI call throws an error", async () => {
    mockComplete.mockRejectedValue(new Error("network timeout"));

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("buy groceries", makePartial(), "user-id");

    expect(result.parsed).toBeNull();
    expect(result.error).toBe("network timeout");
  });

  it("returns parsed: null when AI returns non-JSON content", async () => {
    mockComplete.mockResolvedValue({
      content: "Sorry, I cannot help with that.",
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("buy groceries", makePartial(), "user-id");

    expect(result.parsed).toBeNull();
    expect(result.error).toMatch(/parse failed/i);
  });

  it("returns parsed: null when AI returns a JSON primitive (not object)", async () => {
    mockComplete.mockResolvedValue({
      content: "42",
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("buy groceries", makePartial(), "user-id");

    expect(result.parsed).toBeNull();
  });

  it("returns parsed: null when AI returns JSON null", async () => {
    mockComplete.mockResolvedValue({
      content: "null",
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("buy groceries", makePartial(), "user-id");

    expect(result.parsed).toBeNull();
  });
});

describe("runTier2 — successful parse merges with Tier 1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("returns merged result when AI returns valid JSON", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Buy groceries", tags: ["shopping"], flagged: false }),
      model: "claude-test",
      inputTokens: 20,
      outputTokens: 10,
      costUsd: 0.002,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({
      title: "buy groceries",
      tags: ["errands"],
      entity_refs: ["store"],
    });
    const result = await runTier2("buy groceries", tier1, "user-id", {
      tagNames: ["shopping", "errands", "groceries"],
    });

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.title).toBe("Buy groceries");
    expect(result.parsed!.tags).toContain("shopping");
    expect(result.parsed!.tags).toContain("errands");
    expect(result.parsed!.entity_refs).toEqual(["store"]);
  });

  it("parses AI response wrapped in ```json fences", async () => {
    const payload = { title: "Schedule dentist", tags: ["health"] };
    mockComplete.mockResolvedValue({
      content: "```json\n" + JSON.stringify(payload) + "\n```",
      model: "claude-test",
      inputTokens: 15,
      outputTokens: 8,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("dentist appointment", makePartial(), "user-id", {
      tagNames: ["health", "personal", "medical"],
    });

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.title).toBe("Schedule dentist");
    expect(result.parsed!.tags).toContain("health");
  });

  it("uses Tier 1 due_date when AI provides none", async () => {
    const tier1Due = new Date("2025-06-01T12:00:00Z");
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Doctor visit" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ due_date: tier1Due });
    const result = await runTier2("doctor visit", tier1, "user-id");

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.due_date?.toISOString()).toBe(tier1Due.toISOString());
  });

  it("overrides Tier 1 due_date when AI provides a valid date", async () => {
    const tier1Due = new Date("2025-06-01T12:00:00Z");
    const aiDue = "2025-07-04T09:00:00Z";
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Independence Day event", due_date: aiDue }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ due_date: tier1Due });
    const result = await runTier2("independence day event", tier1, "user-id");

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.due_date?.toISOString()).toBe(new Date(aiDue).toISOString());
  });

  it("inherits flagged from Tier 1 when AI does not set it", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Urgent thing" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ flagged: true });
    const result = await runTier2("urgent thing", tier1, "user-id");

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.flagged).toBe(true);
  });

  it("sets flagged true when AI says so even if Tier 1 did not", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Critical deadline", flagged: true }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ flagged: false });
    const result = await runTier2("critical deadline", tier1, "user-id");

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.flagged).toBe(true);
  });
});

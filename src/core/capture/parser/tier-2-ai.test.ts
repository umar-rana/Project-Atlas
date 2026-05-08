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

describe("runTier2 — context_name field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("adds AI context_name when it matches an available context (case-insensitive)", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Call dentist", context_name: "calls" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("call dentist", makePartial(), "user-id", {
      contextNames: ["Calls", "Email", "Errands"],
    });

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.contexts).toContain("Calls");
  });

  it("preserves original casing of the matched context name", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Call dentist", context_name: "CALLS" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("call dentist", makePartial(), "user-id", {
      contextNames: ["Calls"],
    });

    expect(result.parsed!.contexts).toContain("Calls");
    expect(result.parsed!.contexts).not.toContain("CALLS");
  });

  it("ignores context_name when it does not match any available context", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Call dentist", context_name: "UnknownContext" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("call dentist", makePartial(), "user-id", {
      contextNames: ["Calls", "Email"],
    });

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.contexts).toEqual([]);
  });

  it("ignores context_name when no contextNames list is provided", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Call dentist", context_name: "Calls" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("call dentist", makePartial(), "user-id");

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.contexts).toEqual([]);
  });

  it("merges AI context with existing Tier 1 contexts", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Call and email dentist", context_name: "Email" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ contexts: ["Calls"] });
    const result = await runTier2("call and email dentist", tier1, "user-id", {
      contextNames: ["Calls", "Email"],
    });

    expect(result.parsed!.contexts).toContain("Calls");
    expect(result.parsed!.contexts).toContain("Email");
  });
});

describe("runTier2 — project_name field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("sets project_hint when AI project_name matches an available project (case-insensitive)", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Fix bug", project_name: "website redesign" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("fix bug", makePartial(), "user-id", {
      projectNames: ["Website Redesign", "Mobile App"],
    });

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.project_hint).toBe("Website Redesign");
  });

  it("ignores project_name when it does not match any available project", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Fix bug", project_name: "NonExistentProject" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("fix bug", makePartial(), "user-id", {
      projectNames: ["Website Redesign", "Mobile App"],
    });

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.project_hint).toBeUndefined();
  });

  it("AI project_name overrides Tier 1 project_hint when a match is found", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Fix bug", project_name: "mobile app" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ project_hint: "Website Redesign" });
    const result = await runTier2("fix bug", tier1, "user-id", {
      projectNames: ["Website Redesign", "Mobile App"],
    });

    expect(result.parsed!.project_hint).toBe("Mobile App");
  });

  it("keeps Tier 1 project_hint when AI project_name is unknown", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Fix bug", project_name: "Unknown" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ project_hint: "Website Redesign" });
    const result = await runTier2("fix bug", tier1, "user-id", {
      projectNames: ["Website Redesign"],
    });

    expect(result.parsed!.project_hint).toBe("Website Redesign");
  });
});

describe("runTier2 — proposed_body field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("uses proposed_body when AI provides it", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Plan sprint", proposed_body: "Discuss scope and assign tickets" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("plan sprint", makePartial(), "user-id");

    expect(result.parsed!.proposed_body).toBe("Discuss scope and assign tickets");
    expect(result.parsed!.notes).toBe("Discuss scope and assign tickets");
  });

  it("falls back to notes field when proposed_body is absent", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Plan sprint", notes: "Use the notes field as fallback" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("plan sprint", makePartial(), "user-id");

    expect(result.parsed!.proposed_body).toBe("Use the notes field as fallback");
  });

  it("proposed_body takes priority over notes when both are present", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({
        title: "Plan sprint",
        proposed_body: "Primary body text",
        notes: "Secondary notes",
      }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("plan sprint", makePartial(), "user-id");

    expect(result.parsed!.proposed_body).toBe("Primary body text");
  });

  it("leaves proposed_body undefined when neither proposed_body nor notes is present", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Plan sprint" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("plan sprint", makePartial(), "user-id");

    expect(result.parsed!.proposed_body).toBeUndefined();
  });

  it("leaves proposed_body undefined when proposed_body is an empty string", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Plan sprint", proposed_body: "" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("plan sprint", makePartial(), "user-id");

    expect(result.parsed!.proposed_body).toBeUndefined();
  });
});

describe("runTier2 — estimated_minutes field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("uses AI estimated_minutes when it is a positive number", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Code review", estimated_minutes: 45 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("code review", makePartial(), "user-id");

    expect(result.parsed!.estimated_minutes).toBe(45);
  });

  it("ignores AI estimated_minutes of 0 and falls back to Tier 1", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Code review", estimated_minutes: 0 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ estimated_minutes: 30 });
    const result = await runTier2("code review", tier1, "user-id");

    expect(result.parsed!.estimated_minutes).toBe(30);
  });

  it("ignores negative AI estimated_minutes and falls back to Tier 1", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Code review", estimated_minutes: -5 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ estimated_minutes: 20 });
    const result = await runTier2("code review", tier1, "user-id");

    expect(result.parsed!.estimated_minutes).toBe(20);
  });

  it("leaves estimated_minutes undefined when AI omits it and Tier 1 has none", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Code review" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("code review", makePartial(), "user-id");

    expect(result.parsed!.estimated_minutes).toBeUndefined();
  });
});

describe("runTier2 — proposed_disposition field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it.each(["task", "note", "reference", "unclear"] as const)(
    'accepts valid disposition "%s" from AI',
    async (disposition) => {
      mockComplete.mockResolvedValue({
        content: JSON.stringify({ title: "Do something", proposed_disposition: disposition }),
        model: "claude-test",
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.001,
      });

      const { runTier2 } = await import("./tier-2-ai");
      const result = await runTier2("do something", makePartial(), "user-id");

      expect(result.parsed!.proposed_disposition).toBe(disposition);
    },
  );

  it("falls back to Tier 1 disposition when AI returns an invalid value", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", proposed_disposition: "invalid_value" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const tier1 = makePartial({ proposed_disposition: "task" });
    const result = await runTier2("do something", tier1, "user-id");

    expect(result.parsed!.proposed_disposition).toBe("task");
  });

  it("leaves proposed_disposition undefined when AI omits it and Tier 1 has none", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.proposed_disposition).toBeUndefined();
  });
});

describe("runTier2 — confidence field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCaptureParseLimits.mockResolvedValue(ALLOWED);
    mockBuildCaptureParseUserMessage.mockReturnValue(SHORT_USER_MESSAGE);
  });

  it("uses AI confidence when it is a valid number between 0 and 1", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", confidence: 0.85 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBe(0.85);
  });

  it("clamps confidence above 1 to 1", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", confidence: 1.5 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBe(1);
  });

  it("clamps confidence below 0 to 0", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", confidence: -0.3 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBe(0);
  });

  it("leaves confidence undefined when AI returns null", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", confidence: null }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBeUndefined();
  });

  it("leaves confidence undefined when AI omits the field", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something" }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBeUndefined();
  });

  it("accepts confidence of exactly 0", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", confidence: 0 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBe(0);
  });

  it("accepts confidence of exactly 1", async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify({ title: "Do something", confidence: 1 }),
      model: "claude-test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const { runTier2 } = await import("./tier-2-ai");
    const result = await runTier2("do something", makePartial(), "user-id");

    expect(result.parsed!.confidence).toBe(1);
  });
});

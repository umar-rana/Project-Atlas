import { describe, it, expect } from "vitest";
import { parseInlineTaskText } from "./inline-task-parser";

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

describe("parseInlineTaskText", () => {
  it("returns the plain title when no tokens or dates are present", () => {
    const r = parseInlineTaskText("Quick call");
    expect(r.title).toBe("Quick call");
    expect(r.due_date).toBeUndefined();
    expect(r.tags).toEqual([]);
    expect(r.contexts).toEqual([]);
    expect(r.project_title).toBeUndefined();
  });

  it("extracts #tag tokens and strips them from the title", () => {
    const r = parseInlineTaskText("Buy groceries #errands");
    expect(r.title).toBe("Buy groceries");
    expect(r.tags).toEqual(["errands"]);
  });

  it("extracts ~~context tokens", () => {
    const r = parseInlineTaskText("Drop off package ~~errands");
    expect(r.title).toBe("Drop off package");
    expect(r.contexts).toEqual(["errands"]);
  });

  it("extracts >>project tokens", () => {
    const r = parseInlineTaskText("Write proposal >>Q4 launch");
    expect(r.title).toBe("Write proposal");
    expect(r.project_title).toBe("Q4 launch");
  });

  it("parses 'tomorrow' via the quick-add fast path", () => {
    const r = parseInlineTaskText("Submit timesheet tomorrow");
    expect(r.due_date).toBeDefined();
    const tomorrow = startOfTodayLocal();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(r.due_date!.toDateString()).toBe(tomorrow.toDateString());
    expect(r.title).toBe("Submit timesheet");
  });

  it("falls through to chrono-node for richer phrases ('in three days')", () => {
    const r = parseInlineTaskText("Renew passport in three days");
    expect(r.due_date).toBeDefined();
    expect(r.title.toLowerCase()).not.toContain("three days");
  });

  it("parses time-of-day phrases ('Call dentist tomorrow at 3pm')", () => {
    const r = parseInlineTaskText("Call dentist tomorrow at 3pm");
    expect(r.due_date).toBeDefined();
    // chrono may match the entire phrase or hand off to the quick-add layer.
    // Both cases must produce 3pm on tomorrow.
    expect(r.due_date!.getHours()).toBe(15);
    expect(r.title.toLowerCase()).toContain("call dentist");
  });

  it("combines tag + date in one input", () => {
    const r = parseInlineTaskText("Call dentist tomorrow at 3pm #health");
    expect(r.tags).toEqual(["health"]);
    expect(r.due_date).toBeDefined();
    expect(r.title.toLowerCase()).toContain("call dentist");
  });

  it("does not invent a due date when no phrase is present", () => {
    const r = parseInlineTaskText("Investigate flaky test");
    expect(r.due_date).toBeUndefined();
  });

  it("dedupes multiple identical tags", () => {
    const r = parseInlineTaskText("Plan #work #work");
    expect(r.tags).toEqual(["work"]);
  });

  it("preserves long titles intact when no tokens are detected", () => {
    const long = "A".repeat(450);
    const r = parseInlineTaskText(long);
    expect(r.title).toBe(long);
  });
});

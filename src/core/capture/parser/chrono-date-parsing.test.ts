import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runTier1 } from "./tier-1-local";

const FIXED_NOW = new Date("2026-05-02T10:00:00.000Z");
const opts = { userTimezone: "UTC", projectTitles: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function dayOf(d: Date) {
  return d.toISOString().slice(0, 10);
}

describe("parseDateWithChrono — common natural language dates", () => {
  it("parses 'tomorrow' as the next calendar day", () => {
    const result = runTier1("finish the report tomorrow", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(dayOf(result.due_date!)).toBe("2026-05-03");
  });

  it("parses 'today' as the current calendar day", () => {
    const result = runTier1("call the client today", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(dayOf(result.due_date!)).toBe("2026-05-02");
  });

  it("parses 'next Friday' as the upcoming Friday", () => {
    const result = runTier1("submit the proposal next Friday", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    const day = result.due_date!.getDay();
    expect(day).toBe(5);
    expect(result.due_date!.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("parses 'next Monday' as the upcoming Monday", () => {
    const result = runTier1("team standup next Monday", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getDay()).toBe(1);
    expect(result.due_date!.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("parses 'next week' as a date in the next 7–14 days", () => {
    const result = runTier1("review the budget next week", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    const diffDays = (result.due_date!.getTime() - FIXED_NOW.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(0);
    expect(diffDays).toBeLessThanOrEqual(14);
  });

  it("parses 'in 3 days' as three calendar days from now", () => {
    const result = runTier1("send the invoice in 3 days", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(dayOf(result.due_date!)).toBe("2026-05-05");
  });

  it("parses 'in two weeks' as approximately 14 days from now", () => {
    const result = runTier1("schedule the review in two weeks", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    const diffDays = (result.due_date!.getTime() - FIXED_NOW.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(13);
    expect(diffDays).toBeLessThanOrEqual(15);
  });

  it("parses a specific date like 'May 15' as that date in the current or next year", () => {
    const result = runTier1("dentist appointment May 15", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getMonth()).toBe(4);
    expect(result.due_date!.getDate()).toBe(15);
  });

  it("parses 'end of month' style phrase 'May 31'", () => {
    const result = runTier1("file tax return by May 31", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(dayOf(result.due_date!)).toBe("2026-05-31");
  });
});

describe("parseDateWithChrono — time-of-day qualifiers", () => {
  // Note: expressions handled by parseQuickAdd ("tomorrow", "next Monday", etc.)
  // set dates at midnight and go through setEodIfMidnight → always 17:00.
  // Time-of-day override logic in parseDateWithChrono is exercised by date
  // expressions that bypass parseQuickAdd (e.g. "in 3 days", "May 20").

  it("sets hour to 9 when 'morning' is mentioned with a chrono-only date", () => {
    const result = runTier1("gym in 3 days morning", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(9);
  });

  it("sets hour to 14 when 'afternoon' is mentioned with a chrono-only date", () => {
    const result = runTier1("call in 3 days afternoon", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(14);
  });

  it("sets hour to 18 when 'evening' is mentioned with a chrono-only date", () => {
    const result = runTier1("dinner in 3 days evening", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(18);
  });

  it("sets hour to 18 when 'tonight' is mentioned", () => {
    const result = runTier1("finish slides tonight", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(18);
  });

  it("uses explicit time when provided (e.g. 'at 3pm in 3 days')", () => {
    const result = runTier1("meeting at 3pm in 3 days", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(15);
  });

  it("defaults to EOD (17:00) when a quick-parsed date (tomorrow) has no time qualifier", () => {
    const result = runTier1("send the report tomorrow", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(17);
  });

  it("defaults to EOD (17:00) when a chrono-only date has no time qualifier", () => {
    const result = runTier1("submit invoice in 3 days", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getHours()).toBe(17);
  });
});

describe("parseDateWithChrono — no date in text", () => {
  it("returns undefined due_date when there is no date expression", () => {
    const result = runTier1("buy milk and eggs", opts);
    expect(result.due_date).toBeUndefined();
  });

  it("returns undefined due_date for a generic task title", () => {
    const result = runTier1("write unit tests for the parser module", opts);
    expect(result.due_date).toBeUndefined();
  });

  it("returns undefined due_date for a short single-word input", () => {
    const result = runTier1("laundry", opts);
    expect(result.due_date).toBeUndefined();
  });

  it("returns undefined due_date for text with numbers but no date", () => {
    const result = runTier1("review 5 pull requests and 3 issues", opts);
    expect(result.due_date).toBeUndefined();
  });
});

describe("parseDateWithChrono — edge cases", () => {
  it("advances a past day-of-week name to the next occurrence (forwardDate: true)", () => {
    // FIXED_NOW is Saturday 2026-05-02; 'last Thursday' was 2026-04-30
    // chrono with forwardDate:true returns the NEXT Thursday: 2026-05-07
    const result = runTier1("task due last Thursday", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getDay()).toBe(4);
    expect(result.due_date!.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("does not blow up on empty string input", () => {
    expect(() => runTier1("", opts)).not.toThrow();
    const result = runTier1("", opts);
    expect(result.due_date).toBeUndefined();
  });

  it("does not blow up on very long input", () => {
    const longText = "do something important ".repeat(200) + "by tomorrow";
    expect(() => runTier1(longText, opts)).not.toThrow();
    const result = runTier1(longText, opts);
    expect(result.due_date).toBeInstanceOf(Date);
  });

  it("strips the date phrase from the title so it does not appear twice", () => {
    const result = runTier1("submit report tomorrow", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.title?.toLowerCase()).not.toContain("tomorrow");
  });

  it("keeps the rest of the title intact after date extraction", () => {
    const result = runTier1("submit the budget report by next Friday", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.title?.toLowerCase()).toContain("submit");
    expect(result.title?.toLowerCase()).toContain("budget");
    expect(result.title?.toLowerCase()).toContain("report");
  });

  it("handles multiple date expressions by picking the first one", () => {
    const result = runTier1("tomorrow or next week, finish the audit", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(dayOf(result.due_date!)).toBe("2026-05-03");
  });

  it("parses a fully qualified date with year", () => {
    const result = runTier1("contract expires June 1 2027", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getFullYear()).toBe(2027);
    expect(result.due_date!.getMonth()).toBe(5);
    expect(result.due_date!.getDate()).toBe(1);
  });

  it("produces a due_date regardless of userTimezone option (timezone currently parsed from system clock)", () => {
    // TODO: userTimezone is currently voided in parseDateWithChrono (see `void timezone`).
    // This test documents the current limitation — all timezones produce the same result.
    // Update this test (and the implementation) when full timezone-aware parsing is added.
    // Tracked in follow-up task #279.
    const utcOpts = { userTimezone: "UTC", projectTitles: [] };
    const nyOpts = { userTimezone: "America/New_York", projectTitles: [] };
    const utcResult = runTier1("call in 3 days", utcOpts);
    const nyResult = runTier1("call in 3 days", nyOpts);
    expect(utcResult.due_date).toBeInstanceOf(Date);
    expect(nyResult.due_date).toBeInstanceOf(Date);
    expect(dayOf(utcResult.due_date!)).toBe(dayOf(nyResult.due_date!));
  });

  it("parses an unambiguous numeric date (MM/DD) as month/day in the current year", () => {
    // chrono-node interprets MM/DD as month/day (US locale default)
    const result = runTier1("meeting 06/15", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getMonth()).toBe(5);
    expect(result.due_date!.getDate()).toBe(15);
  });

  it("parses an ambiguous numeric date (05/06) as MM/DD — May 6 in US locale", () => {
    // 05/06 could mean May 6 (MM/DD) or June 5 (DD/MM).
    // chrono-node defaults to MM/DD (US locale), so this resolves as May 6.
    const result = runTier1("task due 05/06", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getMonth()).toBe(4);
    expect(result.due_date!.getDate()).toBe(6);
  });

  it("correctly offsets an explicit timezone abbreviation in the text (e.g. 2pm EST)", () => {
    // When the user writes "2pm EST", chrono marks the hour as certain and
    // produces a UTC Date equivalent to 14:00 EST = 19:00 UTC.
    // This works independently of the userTimezone option.
    const result = runTier1("meeting at 2pm EST in 3 days", opts);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.due_date!.getUTCHours()).toBe(19);
    expect(dayOf(result.due_date!)).toBe("2026-05-05");
  });
});

import { describe, it, expect } from "vitest";
import { isInToday, getForecastDayKey, type TaskLike } from "./task-filters";

const NOW = new Date("2026-04-30T10:00:00Z");

const TODAY_START = new Date("2026-04-30T00:00:00Z");
const TOMORROW_START = new Date("2026-05-01T00:00:00Z");
const YESTERDAY_START = new Date("2026-04-29T00:00:00Z");

function task(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    due_date: null,
    defer_date: null,
    flagged: false,
    status: "active",
    ...overrides,
  };
}

describe("isInToday", () => {
  it("includes a task due exactly today", () => {
    const t = task({ due_date: TODAY_START });
    expect(isInToday(t, NOW)).toBe(true);
  });

  it("excludes a task due exactly tomorrow", () => {
    const t = task({ due_date: TOMORROW_START });
    expect(isInToday(t, NOW)).toBe(false);
  });

  it("includes a task due yesterday (overdue)", () => {
    const t = task({ due_date: YESTERDAY_START });
    expect(isInToday(t, NOW)).toBe(true);
  });

  it("includes a flagged task with no due date", () => {
    const t = task({ flagged: true, due_date: null });
    expect(isInToday(t, NOW)).toBe(true);
  });

  it("includes a flagged task with due_date = tomorrow", () => {
    const t = task({ flagged: true, due_date: TOMORROW_START });
    expect(isInToday(t, NOW)).toBe(true);
  });

  it("excludes a task deferred to tomorrow even if due today", () => {
    const t = task({ due_date: TODAY_START, defer_date: TOMORROW_START });
    expect(isInToday(t, NOW)).toBe(false);
  });

  it("excludes a flagged task deferred to tomorrow", () => {
    const t = task({ flagged: true, defer_date: TOMORROW_START });
    expect(isInToday(t, NOW)).toBe(false);
  });

  it("includes a task whose defer_date was yesterday (now available)", () => {
    const t = task({ due_date: TODAY_START, defer_date: YESTERDAY_START });
    expect(isInToday(t, NOW)).toBe(true);
  });

  it("excludes a task with no due_date, no flag, and no defer", () => {
    const t = task();
    expect(isInToday(t, NOW)).toBe(false);
  });
});

describe("getForecastDayKey — due_date bucketing", () => {
  const START = TODAY_START;
  const END = new Date("2026-05-06T23:59:59.999Z");

  it("returns the correct key for a task due today", () => {
    const t = task({ due_date: TODAY_START });
    expect(getForecastDayKey(t, START, END)).toBe("2026-04-30");
  });

  it("returns the correct key for a task due tomorrow", () => {
    const t = task({ due_date: TOMORROW_START });
    expect(getForecastDayKey(t, START, END)).toBe("2026-05-01");
  });

  it("returns null for a task due before the range (overdue — shown in overdue section)", () => {
    const t = task({ due_date: YESTERDAY_START });
    expect(getForecastDayKey(t, START, END)).toBeNull();
  });

  it("returns null for a task with no due_date and no defer_date", () => {
    const t = task({ flagged: true });
    expect(getForecastDayKey(t, START, END)).toBeNull();
  });

  it("returns null for a task due after the range", () => {
    const t = task({ due_date: new Date("2026-05-10T00:00:00Z") });
    expect(getForecastDayKey(t, START, END)).toBeNull();
  });

  it("returns the last day key for a task due on the last day of range", () => {
    const lastDay = new Date("2026-05-06T00:00:00Z");
    const t = task({ due_date: lastDay });
    expect(getForecastDayKey(t, START, END)).toBe("2026-05-06");
  });

  it("tomorrow-due task appears in tomorrow column, not today", () => {
    const todayKey = getForecastDayKey(task({ due_date: TODAY_START }), START, END);
    const tomorrowKey = getForecastDayKey(task({ due_date: TOMORROW_START }), START, END);
    expect(todayKey).toBe("2026-04-30");
    expect(tomorrowKey).toBe("2026-05-01");
    expect(todayKey).not.toBe(tomorrowKey);
  });

  it("flagged task with due_date = tomorrow appears in tomorrow's Forecast column", () => {
    const t = task({ due_date: TOMORROW_START, flagged: true });
    expect(getForecastDayKey(t, START, END)).toBe("2026-05-01");
  });

  it("flagged task with no due_date and no defer_date returns null (not in any day slot)", () => {
    const t = task({ flagged: true, due_date: null, defer_date: null });
    expect(getForecastDayKey(t, START, END)).toBeNull();
  });
});

describe("getForecastDayKey — defer_date secondary bucketing", () => {
  const START = TODAY_START;
  const END = new Date("2026-05-06T23:59:59.999Z");

  it("task with no due_date but defer_date = tomorrow appears in tomorrow slot", () => {
    const t = task({ due_date: null, defer_date: TOMORROW_START });
    expect(getForecastDayKey(t, START, END)).toBe("2026-05-01");
  });

  it("task with defer_date in range but past (yesterday) returns null (not in range start)", () => {
    const t = task({ due_date: null, defer_date: YESTERDAY_START });
    expect(getForecastDayKey(t, START, END)).toBeNull();
  });

  it("task with defer_date after range returns null", () => {
    const t = task({ due_date: null, defer_date: new Date("2026-05-10T00:00:00Z") });
    expect(getForecastDayKey(t, START, END)).toBeNull();
  });

  it("due_date takes priority over defer_date when both are set", () => {
    const t = task({ due_date: TODAY_START, defer_date: TOMORROW_START });
    expect(getForecastDayKey(t, START, END)).toBe("2026-04-30");
  });
});

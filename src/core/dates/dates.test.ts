import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatTime,
  formatDateTime,
  parseUserDate,
  isToday,
  isThisWeek,
  today,
  yesterday,
  tomorrow,
  type UserDatePrefs,
} from "./index";

const UTC_PREFS: UserDatePrefs = {
  timezone: "UTC",
  date_format: "DD/MM/YYYY",
  time_format: "24h",
};

const KHI_PREFS: UserDatePrefs = {
  timezone: "Asia/Karachi",
  date_format: "DD/MM/YYYY",
  time_format: "24h",
};

const LA_PREFS: UserDatePrefs = {
  timezone: "America/Los_Angeles",
  date_format: "MM/DD/YYYY",
  time_format: "12h",
};

describe("formatDate", () => {
  it("formats in UTC", () => {
    const d = new Date("2024-01-15T12:00:00Z");
    expect(formatDate(d, UTC_PREFS)).toBe("15/01/2024");
  });

  it("formats in Asia/Karachi (UTC+5)", () => {
    const d = new Date("2024-01-15T20:00:00Z");
    expect(formatDate(d, KHI_PREFS)).toBe("16/01/2024");
  });

  it("formats in America/Los_Angeles (UTC-8)", () => {
    // 2024-01-15 16:00:00 UTC = 2024-01-15 08:00:00 PST (UTC-8)
    const d = new Date("2024-01-15T16:00:00Z");
    expect(formatDate(d, LA_PREFS)).toBe("01/15/2024");
  });

  it("handles DST transition — spring forward (clocks move 2am→3am)", () => {
    // 2024-03-10 10:00:00 UTC is 02:00 PST right at the spring-forward transition.
    // After the clock change PDT = UTC-7, so 10:00 UTC = 03:00 PDT.
    // Either way the calendar date is still 2024-03-10 in LA.
    const d = new Date("2024-03-10T10:00:00Z");
    expect(formatDate(d, LA_PREFS)).toBe("03/10/2024");
  });

  it("handles DST transition — fall back (clock falls back 2am→1am)", () => {
    // 2024-11-03 09:00 UTC = 01:00 PDT (UTC-7) right before fallback.
    // 2024-11-03 10:00 UTC = 02:00 PST (UTC-8) right after fallback.
    // Both are still 2024-11-03 in LA.
    const before = new Date("2024-11-03T09:00:00Z");
    const after = new Date("2024-11-03T10:00:00Z");
    expect(formatDate(before, LA_PREFS)).toBe("11/03/2024");
    expect(formatDate(after, LA_PREFS)).toBe("11/03/2024");
  });

  it("handles year boundary in Karachi", () => {
    const d = new Date("2023-12-31T20:00:00Z");
    expect(formatDate(d, KHI_PREFS)).toBe("01/01/2024");
  });
});

describe("formatTime", () => {
  it("formats 24h UTC", () => {
    const d = new Date("2024-01-15T14:30:00Z");
    expect(formatTime(d, UTC_PREFS)).toBe("14:30");
  });

  it("formats 12h LA with AM/PM", () => {
    const d = new Date("2024-01-15T15:30:00Z");
    const result = formatTime(d, LA_PREFS);
    expect(result).toMatch(/AM|PM/);
  });
});

describe("formatDateTime", () => {
  it("combines date and time in UTC", () => {
    const d = new Date("2024-06-01T08:30:00Z");
    const result = formatDateTime(d, UTC_PREFS);
    expect(result).toContain("01/06/2024");
    expect(result).toContain("08:30");
  });
});

describe("today / yesterday / tomorrow", () => {
  it("today in UTC is today", () => {
    const t = today("UTC");
    const now = new Date();
    expect(t.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(t.getUTCMonth()).toBe(now.getUTCMonth());
    expect(t.getUTCDate()).toBe(now.getUTCDate());
  });

  it("yesterday is one day before today", () => {
    const t = today("UTC");
    const y = yesterday("UTC");
    const diff = t.getTime() - y.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it("tomorrow is one day after today", () => {
    const t = today("UTC");
    const tom = tomorrow("UTC");
    const diff = tom.getTime() - t.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });
});

describe("isToday", () => {
  it("now is today in UTC", () => {
    expect(isToday(new Date(), "UTC")).toBe(true);
  });

  it("yesterday is not today", () => {
    const y = yesterday("UTC");
    expect(isToday(y, "UTC")).toBe(false);
  });
});

describe("isThisWeek", () => {
  it("today is this week", () => {
    expect(isThisWeek(new Date(), "UTC")).toBe(true);
  });
});

describe("parseUserDate", () => {
  it("parses DD/MM/YYYY correctly (not ambiguous as MM/DD/YYYY)", () => {
    const d = parseUserDate("15/06/2024", { timezone: "UTC", date_format: "DD/MM/YYYY", time_format: "24h" });
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("parses MM/DD/YYYY correctly", () => {
    const d = parseUserDate("06/15/2024", { timezone: "UTC", date_format: "MM/DD/YYYY", time_format: "24h" });
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("parses YYYY-MM-DD ISO-style string", () => {
    const d = parseUserDate("2024-06-15", { timezone: "UTC", date_format: "YYYY-MM-DD", time_format: "24h" });
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("applies user timezone when parsing", () => {
    // 15/06/2024 midnight in Asia/Karachi = 2024-06-14T19:00:00Z (UTC-5)
    const d = parseUserDate("15/06/2024", { timezone: "Asia/Karachi", date_format: "DD/MM/YYYY", time_format: "24h" });
    expect(d.getUTCFullYear()).toBe(2024);
    // Midnight Karachi = 2024-06-14 19:00 UTC (Karachi is UTC+5)
    expect(d.getUTCDate()).toBe(14);
    expect(d.getUTCHours()).toBe(19);
  });

  it("falls back to ISO when format does not match but ISO does", () => {
    const d = parseUserDate("2024-06-15T00:00:00.000Z", { timezone: "UTC", date_format: "DD/MM/YYYY", time_format: "24h" });
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("throws on completely invalid input", () => {
    expect(() => parseUserDate("not-a-date", { timezone: "UTC", date_format: "DD/MM/YYYY", time_format: "24h" })).toThrow();
  });
});

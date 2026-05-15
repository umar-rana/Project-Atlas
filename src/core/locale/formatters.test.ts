import { describe, it, expect } from "vitest";
import { formatRelativeDate, formatDateWithOptionalTime } from "./formatters";
import type { LocaleSettings } from "./formatters";

function makeLocale(language: string): LocaleSettings {
  return {
    date_format: "DD/MM/YYYY",
    time_format: "12h",
    number_format: "1,234.56",
    currency_code: "USD",
    currency_symbol: "$",
    language,
  };
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const TODAY_UTC = new Date();
const todayYear = TODAY_UTC.getUTCFullYear();
const todayMonth = TODAY_UTC.getUTCMonth() + 1;
const todayDay = TODAY_UTC.getUTCDate();

const today = utcDate(todayYear, todayMonth, todayDay);
const tomorrow = utcDate(todayYear, todayMonth, todayDay + 1);
const yesterday = utcDate(todayYear, todayMonth, todayDay - 1);

describe("formatRelativeDate", () => {
  describe("English (en)", () => {
    const locale = makeLocale("en");
    it("returns Today for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("Today");
    });
    it("returns Tomorrow for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("Tomorrow");
    });
    it("returns Yesterday for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("Yesterday");
    });
  });

  describe("Arabic (ar)", () => {
    const locale = makeLocale("ar");
    it("returns اليوم for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("اليوم");
    });
    it("returns غداً for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("غداً");
    });
    it("returns أمس for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("أمس");
    });
  });

  describe("French (fr)", () => {
    const locale = makeLocale("fr");
    it("returns Aujourd'hui for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("Aujourd'hui");
    });
    it("returns Demain for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("Demain");
    });
    it("returns Hier for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("Hier");
    });
  });

  describe("Hindi (hi)", () => {
    const locale = makeLocale("hi");
    it("returns आज for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("आज");
    });
    it("returns कल for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("कल");
    });
    it("returns बीता कल for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("बीता कल");
    });
  });

  describe("Urdu (ur)", () => {
    const locale = makeLocale("ur");
    it("returns آج for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("آج");
    });
    it("returns کل for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("کل");
    });
    it("returns گزشتہ کل for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("گزشتہ کل");
    });
  });

  describe("Chinese Simplified (zh-CN)", () => {
    const locale = makeLocale("zh-CN");
    it("returns 今天 for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("今天");
    });
    it("returns 明天 for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("明天");
    });
    it("returns 昨天 for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("昨天");
    });
  });

  describe("Japanese (ja)", () => {
    const locale = makeLocale("ja");
    it("returns 今日 for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("今日");
    });
    it("returns 明日 for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("明日");
    });
    it("returns 昨日 for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("昨日");
    });
  });

  describe("Unknown language fallback", () => {
    const locale = makeLocale("xx-UNKNOWN");
    it("returns English Today for today", () => {
      expect(formatRelativeDate(today, locale)).toBe("Today");
    });
    it("returns English Tomorrow for tomorrow", () => {
      expect(formatRelativeDate(tomorrow, locale)).toBe("Tomorrow");
    });
    it("returns English Yesterday for yesterday", () => {
      expect(formatRelativeDate(yesterday, locale)).toBe("Yesterday");
    });
  });

  describe("Edge cases", () => {
    const locale = makeLocale("en");
    it("returns empty string for null", () => {
      expect(formatRelativeDate(null, locale)).toBe("");
    });
    it("returns empty string for undefined", () => {
      expect(formatRelativeDate(undefined, locale)).toBe("");
    });
    it("returns empty string for invalid date string", () => {
      expect(formatRelativeDate("not-a-date", locale)).toBe("");
    });
    it("accepts an ISO string instead of a Date object", () => {
      expect(formatRelativeDate(today.toISOString(), locale)).toBe("Today");
    });
  });
});

describe("formatDateWithOptionalTime (CR Capture Processing Refinement §3.4 / rule 8.11)", () => {
  // Build a fixed local datetime so the formatted output is deterministic
  // regardless of test-runner timezone. Using local construction here
  // mirrors the production path (browser parses ISO from the server and
  // displays in the user's local timezone).
  const localDateTime = new Date(2026, 4, 20, 15, 0, 0); // May 20 2026, 15:00 local

  it("12h locale: shows date+time when hasTime=true", () => {
    const locale12h = makeLocale("en");
    expect(formatDateWithOptionalTime(localDateTime, locale12h, true)).toBe(
      "20/05/2026 at 3:00 PM",
    );
  });

  it("24h locale: shows date+time in 24h when hasTime=true", () => {
    const locale24h: LocaleSettings = { ...makeLocale("en"), time_format: "24h" };
    expect(formatDateWithOptionalTime(localDateTime, locale24h, true)).toBe(
      "20/05/2026 at 15:00",
    );
  });

  it("hasTime=false: shows date only, never time", () => {
    const locale = makeLocale("en");
    expect(formatDateWithOptionalTime(localDateTime, locale, false)).toBe("20/05/2026");
  });

  it("hasTime=undefined: treated as date-only (defensive)", () => {
    const locale = makeLocale("en");
    expect(formatDateWithOptionalTime(localDateTime, locale, undefined)).toBe("20/05/2026");
  });

  it("null value: returns empty string", () => {
    const locale = makeLocale("en");
    expect(formatDateWithOptionalTime(null, locale, true)).toBe("");
    expect(formatDateWithOptionalTime(null, locale, false)).toBe("");
  });

  it("the flag is the source of truth — non-midnight times are still hidden when hasTime=false (rule 8.11)", () => {
    // Datetime has 15:00 stored but hasTime is false. Per CR rule 8.11,
    // display must show only the date — never infer from the time
    // component. This is the canonical default_event_time behavior:
    // the parser stored 09:00 as the time component for a date-only
    // task; display still treats it as all-day.
    const locale = makeLocale("en");
    expect(formatDateWithOptionalTime(localDateTime, locale, false)).toBe("20/05/2026");
  });
});

import { describe, it, expect } from "vitest";
import { estimateMinutes } from "./time-hints";

describe("estimateMinutes — explicit time patterns", () => {
  it("returns 15 for '15-min'", () => {
    expect(estimateMinutes("15-min review")).toBe(15);
  });

  it("returns 15 for '15 minute'", () => {
    expect(estimateMinutes("15 minute call")).toBe(15);
  });

  it("returns 30 for '30-min'", () => {
    expect(estimateMinutes("30-min sync with team")).toBe(30);
  });

  it("returns 30 for 'half-hour'", () => {
    expect(estimateMinutes("half-hour planning session")).toBe(30);
  });

  it("returns 45 for '45-minute'", () => {
    expect(estimateMinutes("45-minute workout")).toBe(45);
  });

  it("returns 60 for '1-hour'", () => {
    expect(estimateMinutes("1-hour deep work session")).toBe(60);
  });

  it("returns 60 for 'one hour'", () => {
    expect(estimateMinutes("one hour design review")).toBe(60);
  });

  it("returns 120 for '2-hour'", () => {
    expect(estimateMinutes("2-hour workshop")).toBe(120);
  });

  it("returns 120 for 'two hour'", () => {
    expect(estimateMinutes("two hour training")).toBe(120);
  });
});

describe("estimateMinutes — implicit time hints", () => {
  it("returns 15 for 'quick call'", () => {
    expect(estimateMinutes("quick call with Alice")).toBe(15);
  });

  it("returns 15 for 'quick chat'", () => {
    expect(estimateMinutes("quick chat with the team")).toBe(15);
  });

  it("returns 30 for 'brief sync'", () => {
    expect(estimateMinutes("brief sync with PM")).toBe(30);
  });

  it("returns 60 for 'standup' because it is included in the meeting|standup combined pattern", () => {
    // The meeting pattern `/\b(meeting|standup|...)\b/i` matches 'standup' and returns 60
    expect(estimateMinutes("standup")).toBe(60);
  });

  it("returns 60 for 'standup meeting'", () => {
    expect(estimateMinutes("standup meeting")).toBe(60);
  });

  it("returns 15 for 'daily' which only matches the standup/daily pattern", () => {
    expect(estimateMinutes("daily check-in")).toBe(15);
  });

  it("returns 30 for 'review article'", () => {
    expect(estimateMinutes("review article about GTD")).toBe(30);
  });

  it("returns 5 for 'email'", () => {
    expect(estimateMinutes("email Sarah with project update")).toBe(5);
  });

  it("returns 5 for 'reply'", () => {
    expect(estimateMinutes("reply to contractor invoice")).toBe(5);
  });
});

describe("estimateMinutes — returns undefined when no pattern matches", () => {
  it("returns undefined for generic text with no time hint", () => {
    expect(estimateMinutes("buy milk")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(estimateMinutes("")).toBeUndefined();
  });

  it("returns undefined for note-style text", () => {
    expect(estimateMinutes("idea for a new product feature")).toBeUndefined();
  });
});

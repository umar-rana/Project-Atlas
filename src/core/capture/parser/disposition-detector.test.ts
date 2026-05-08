import { describe, it, expect } from "vitest";
import { detectDisposition } from "./disposition-detector";

describe("detectDisposition — action verb → task", () => {
  it.each([
    "Call dentist tomorrow",
    "Email Sarah about the proposal",
    "Buy milk and eggs",
    "Schedule dentist appointment",
    "Fix the bug in auth module",
    "Review the pull request",
    "Submit the quarterly report",
    "Cancel the subscription",
  ])('detects "%s" as task', (text) => {
    expect(detectDisposition(text)).toBe("task");
  });
});

describe("detectDisposition — note prefix → note", () => {
  it.each([
    "Idea: build a habit tracker",
    "Note: always use prepared statements",
    "Remember: call mom on her birthday",
    "Thought: the team morale seems low",
    "Insight: the bottleneck is in the DB layer",
    "Lesson: never deploy on Fridays",
    "Reference: GTD book chapter 3",
  ])('detects "%s" as note', (text) => {
    expect(detectDisposition(text)).toBe("note");
  });
});

describe("detectDisposition — reference patterns → reference", () => {
  it("detects URL as reference", () => {
    expect(detectDisposition("https://example.com/article")).toBe("reference");
  });

  it("detects http URL as reference", () => {
    expect(detectDisposition("http://docs.example.com")).toBe("reference");
  });

  it("URL takes priority over note-prefix (reference checked first)", () => {
    // The reference check runs before note-prefix check, so URL wins
    expect(detectDisposition("Resource: https://example.com")).toBe("reference");
  });

  it("detects read/article/book prefixes as reference", () => {
    expect(detectDisposition("read the article about GTD")).toBe("reference");
    expect(detectDisposition("article on productivity")).toBe("reference");
    expect(detectDisposition("book recommendation from Alice")).toBe("reference");
    expect(detectDisposition("watch the demo video")).toBe("reference");
  });

  it("detects file extension as reference", () => {
    expect(detectDisposition("design-spec.pdf")).toBe("reference");
    expect(detectDisposition("report.docx")).toBe("reference");
  });
});

describe("detectDisposition — long text → note", () => {
  it("detects long text (>20 words) without action verb as note", () => {
    const longText =
      "The project started well but over time the team lost focus and the scope expanded beyond what was originally planned by the stakeholders";
    expect(detectDisposition(longText)).toBe("note");
  });
});

describe("detectDisposition — short 2+ word without action → task", () => {
  it("detects short multi-word text with no pattern as task", () => {
    expect(detectDisposition("dentist appointment")).toBe("task");
    expect(detectDisposition("team meeting")).toBe("task");
  });
});

describe("detectDisposition — single word or empty → unclear", () => {
  it("detects single-word text as unclear", () => {
    expect(detectDisposition("dentist")).toBe("unclear");
    expect(detectDisposition("")).toBe("unclear");
  });
});

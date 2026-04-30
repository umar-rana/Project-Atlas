import { describe, it, expect } from "vitest";
import { runTier1 } from "./tier-1-local";

describe("Tag gating — explicit #tag extraction", () => {
  const opts = { userTimezone: "UTC", projectTitles: [] };

  it("extracts only #tag syntax as explicit tags from Tier-1", () => {
    const result = runTier1("buy milk #groceries #errands", opts);
    expect(result.tags).toEqual(expect.arrayContaining(["groceries", "errands"]));
    expect(result.tags).toHaveLength(2);
  });

  it("returns no explicit tags when there is no #tag syntax", () => {
    const result = runTier1("schedule a dentist appointment next week", opts);
    expect(result.tags).toHaveLength(0);
  });

  it("preserves explicit tags regardless of surrounding text", () => {
    const result = runTier1("call Alice about the project #work #urgent today", opts);
    expect(result.tags).toContain("work");
    expect(result.tags).toContain("urgent");
  });

  it("lowercases and deduplicates explicit tags", () => {
    const result = runTier1("fix bug #Work #work #WORK", opts);
    expect(result.tags).toEqual(["work"]);
  });

  it("does not include AI-only label text as explicit tags", () => {
    // Text that AI might label as 'cooking' or 'recipe' but has no #tag syntax
    const result = runTier1("make pasta carbonara for dinner", opts);
    expect(result.tags).toHaveLength(0);
  });

  it("handles mixed explicit and text content correctly", () => {
    const result = runTier1("email the report #work to the team", opts);
    expect(result.tags).toEqual(["work"]);
  });
});

describe("Tag gating — explicit vs AI-suggested invariant", () => {
  it("ensures tier1.tags only contains #tag-syntax extracted tags (not NLP entities)", () => {
    // Even when the text mentions domain words, tier1 tags must be empty without #
    const result1 = runTier1("prepare tax documents for April filing", { userTimezone: "UTC", projectTitles: [] });
    expect(result1.tags).toHaveLength(0);

    // With explicit syntax, tags appear
    const result2 = runTier1("prepare tax documents #finance #taxes", { userTimezone: "UTC", projectTitles: [] });
    expect(result2.tags).toContain("finance");
    expect(result2.tags).toContain("taxes");
  });
});

import { describe, it, expect } from "vitest";
import { classifyParsedTags } from "./service";

describe("classifyParsedTags — tag gating invariants", () => {
  it("puts explicit #tag-syntax names in autoApply", () => {
    const explicit = new Set(["work", "urgent"]);
    const existing = new Set<string>();
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["work", "urgent", "cooking"],
      explicit,
      existing,
    );
    expect(autoApply).toContain("work");
    expect(autoApply).toContain("urgent");
    expect(suggestedNew).toContain("cooking");
  });

  it("puts AI-detected tags that already exist in user library in autoApply", () => {
    const explicit = new Set<string>();
    const existing = new Set(["finance", "taxes"]);
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["finance", "taxes", "newcategory"],
      explicit,
      existing,
    );
    expect(autoApply).toContain("finance");
    expect(autoApply).toContain("taxes");
    expect(suggestedNew).toContain("newcategory");
  });

  it("puts AI-detected tags that do NOT exist in user library in suggestedNew", () => {
    const explicit = new Set<string>();
    const existing = new Set<string>();
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["cooking", "recipe", "dinner"],
      explicit,
      existing,
    );
    expect(autoApply).toHaveLength(0);
    expect(suggestedNew).toEqual(expect.arrayContaining(["cooking", "recipe", "dinner"]));
  });

  it("never puts an AI-new tag in autoApply even if it looks like a common word", () => {
    const explicit = new Set<string>();
    const existing = new Set<string>();
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["health", "exercise", "fitness"],
      explicit,
      existing,
    );
    expect(autoApply).toHaveLength(0);
    expect(suggestedNew).toHaveLength(3);
  });

  it("deduplicates output correctly", () => {
    const explicit = new Set(["work"]);
    const existing = new Set(["work"]);
    const { autoApply } = classifyParsedTags(["work", "work"], explicit, existing);
    expect(autoApply).toHaveLength(1);
    expect(autoApply).toContain("work");
  });

  it("handles empty input gracefully", () => {
    const { autoApply, suggestedNew } = classifyParsedTags(
      [],
      new Set(),
      new Set(),
    );
    expect(autoApply).toHaveLength(0);
    expect(suggestedNew).toHaveLength(0);
  });

  it("is case-insensitive in classification", () => {
    const explicit = new Set(["work"]);
    const existing = new Set(["finance"]);
    const { autoApply, suggestedNew } = classifyParsedTags(
      ["WORK", "Finance", "Cooking"],
      explicit,
      existing,
    );
    expect(autoApply).toContain("work");
    expect(autoApply).toContain("finance");
    expect(suggestedNew).toContain("cooking");
  });
});

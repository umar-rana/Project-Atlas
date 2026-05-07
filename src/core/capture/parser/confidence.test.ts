import { describe, it, expect } from "vitest";
import { scoreConfidence } from "./confidence";
import type { PartialParse } from "./types";

function makePartial(overrides: Partial<PartialParse> = {}): PartialParse {
  return {
    title: undefined,
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

describe("scoreConfidence — edge cases", () => {
  it("returns score 0 for empty raw text and empty partial parse", () => {
    const result = scoreConfidence("", makePartial());
    expect(result.score).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it("returns score 0 for whitespace-only raw text and empty partial", () => {
    const result = scoreConfidence("   \n\t  ", makePartial());
    expect(result.score).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it("applies full vagueness penalty for all-noise text (multiple vague words)", () => {
    const noisy = "something anything whatever stuff thing";
    const result = scoreConfidence(
      noisy,
      makePartial({ title: "something anything whatever stuff" }),
    );

    const vagueSignal = result.signals.find((s) => s.name === "vague_words");
    expect(vagueSignal).toBeDefined();
    expect(vagueSignal!.contribution).toBe(-0.4);
    expect(result.score).toBe(0);
  });

  it("applies abstract language penalty when text contains abstract phrases", () => {
    const text = "maybe I should possibly think about this";
    const result = scoreConfidence(text, makePartial({ title: "think about this" }));

    const abstractSignal = result.signals.find((s) => s.name === "abstract_language");
    expect(abstractSignal).toBeDefined();
    expect(abstractSignal!.contribution).toBeLessThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("caps vagueness penalty at -0.40 even with many vague words", () => {
    const text = "something something something something something something";
    const result = scoreConfidence(text, makePartial());

    const vagueSignal = result.signals.find((s) => s.name === "vague_words");
    expect(vagueSignal).toBeDefined();
    expect(vagueSignal!.contribution).toBe(-0.4);
  });

  it("caps abstract language penalty at -0.30 even with many abstract phrases", () => {
    const text = "maybe perhaps possibly kinda sort of kind of think feel";
    const result = scoreConfidence(text, makePartial());

    const abstractSignal = result.signals.find((s) => s.name === "abstract_language");
    expect(abstractSignal).toBeDefined();
    expect(abstractSignal!.contribution).toBe(-0.3);
  });

  it("returns score in [0, 1] range regardless of inputs", () => {
    const extremePositive = makePartial({
      title: "buy milk tomorrow",
      tags: ["groceries"],
      due_date: new Date(),
      entity_refs: ["milk"],
      urgency_signals: ["urgent"],
    });
    const high = scoreConfidence("buy milk tomorrow #groceries urgent", extremePositive);
    expect(high.score).toBeGreaterThanOrEqual(0);
    expect(high.score).toBeLessThanOrEqual(1);

    const low = scoreConfidence("something maybe whatever", makePartial({ title: "x" }));
    expect(low.score).toBeGreaterThanOrEqual(0);
    expect(low.score).toBeLessThanOrEqual(1);
  });

  it("adds title_quality signal for a clean 2–12 word title", () => {
    const result = scoreConfidence(
      "call dentist tomorrow",
      makePartial({ title: "call dentist tomorrow" }),
    );
    const titleSignal = result.signals.find((s) => s.name === "title_quality");
    expect(titleSignal).toBeDefined();
    expect(titleSignal!.contribution).toBe(0.25);
  });

  it("adds title_quality_weak signal for a single long word title", () => {
    const result = scoreConfidence("dentistry", makePartial({ title: "dentistry" }));
    const weakSignal = result.signals.find((s) => s.name === "title_quality_weak");
    expect(weakSignal).toBeDefined();
    expect(weakSignal!.contribution).toBe(0.1);
  });

  it("adds no title signal when title is a single very short word", () => {
    const result = scoreConfidence("ok", makePartial({ title: "ok" }));
    const anyTitle = result.signals.filter((s) => s.name.startsWith("title_quality"));
    expect(anyTitle).toHaveLength(0);
  });

  it("adds reference_tokens signal when tags, contexts, or project_hint present", () => {
    const result = scoreConfidence("do the thing", makePartial({ tags: ["work"] }));
    const refSignal = result.signals.find((s) => s.name === "reference_tokens");
    expect(refSignal).toBeDefined();
    expect(refSignal!.contribution).toBe(0.15);
  });

  it("adds entities_found signal when entity_refs are present", () => {
    const result = scoreConfidence("email Alice", makePartial({ entity_refs: ["Alice"] }));
    const entSignal = result.signals.find((s) => s.name === "entities_found");
    expect(entSignal).toBeDefined();
    expect(entSignal!.contribution).toBe(0.1);
  });

  it("adds date_found signal when due_date is present", () => {
    const result = scoreConfidence("buy milk tomorrow", makePartial({ due_date: new Date() }));
    const dateSignal = result.signals.find((s) => s.name === "date_found");
    expect(dateSignal).toBeDefined();
    expect(dateSignal!.contribution).toBe(0.3);
  });

  it("adds urgency signal for urgency_signals", () => {
    const result = scoreConfidence(
      "urgent meeting now",
      makePartial({ urgency_signals: ["urgent"] }),
    );
    const urgSignal = result.signals.find((s) => s.name === "urgency_signals");
    expect(urgSignal).toBeDefined();
    expect(urgSignal!.contribution).toBe(0.05);
  });
});

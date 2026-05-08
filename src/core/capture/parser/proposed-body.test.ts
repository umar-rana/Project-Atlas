import { describe, it, expect } from "vitest";
import { runTier1 } from "./tier-1-local";

const opts = { userTimezone: "UTC", projectTitles: [] };

describe("runTier1 — proposed_body from multi-line input", () => {
  it("returns undefined proposed_body for single-line input", () => {
    const result = runTier1("call dentist tomorrow", opts);
    expect(result.proposed_body).toBeUndefined();
  });

  it("returns body lines when input has multiple lines", () => {
    const raw = "Meeting with Alice\nDiscuss roadmap\nReview Q3 targets";
    const result = runTier1(raw, opts);
    expect(result.proposed_body).toBe("Discuss roadmap\nReview Q3 targets");
  });

  it("trims trailing whitespace from body", () => {
    const raw = "Review PR\n   details here   \n";
    const result = runTier1(raw, opts);
    expect(result.proposed_body).toBe("details here");
  });

  it("returns undefined when only trailing empty lines exist", () => {
    const raw = "call the client\n\n";
    const result = runTier1(raw, opts);
    expect(result.proposed_body).toBeUndefined();
  });

  it("uses only the first line as the title when multi-line", () => {
    const raw = "Buy groceries\n- Milk\n- Eggs\n- Bread";
    const result = runTier1(raw, opts);
    expect(result.title).toMatch(/Buy groceries/i);
    expect(result.proposed_body).toBe("- Milk\n- Eggs\n- Bread");
  });
});

describe("runTier1 — proposed_disposition and estimated_minutes integration", () => {
  it("detects task disposition for action verb text", () => {
    const result = runTier1("Call dentist tomorrow", opts);
    expect(result.proposed_disposition).toBe("task");
  });

  it("detects reference disposition for URL", () => {
    const result = runTier1("https://example.com/article", opts);
    expect(result.proposed_disposition).toBe("reference");
  });

  it("extracts estimated_minutes for call text", () => {
    const result = runTier1("quick call with Alice", opts);
    expect(result.estimated_minutes).toBe(15);
  });

  it("returns undefined estimated_minutes for generic text", () => {
    const result = runTier1("idea about product", opts);
    expect(result.estimated_minutes).toBeUndefined();
  });
});

describe("runTier1 — context inference integration", () => {
  it("infers context when matching keyword and context is available", () => {
    const result = runTier1("call dentist tomorrow", {
      ...opts,
      contextNames: ["Calls", "Email"],
    });
    expect(result.contexts).toContain("Calls");
  });

  it("does not infer context when not in available list", () => {
    const result = runTier1("call dentist tomorrow", {
      ...opts,
      contextNames: ["Email"],
    });
    expect(result.contexts).not.toContain("Calls");
  });
});

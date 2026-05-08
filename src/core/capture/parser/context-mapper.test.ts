import { describe, it, expect } from "vitest";
import { inferContextsFromText } from "./context-mapper";

describe("inferContextsFromText — returns empty when no available contexts", () => {
  it("returns [] when availableContextNames is empty", () => {
    const result = inferContextsFromText("call the dentist", []);
    expect(result).toEqual([]);
  });
});

describe("inferContextsFromText — keyword matching", () => {
  const available = ["Calls", "Email", "Errands", "Meetings", "Computer", "Reading", "Waiting"];

  it("maps 'call' → Calls", () => {
    expect(inferContextsFromText("call dentist tomorrow", available)).toContain("Calls");
  });

  it("maps 'email' → Email", () => {
    expect(inferContextsFromText("email Sarah about the project", available)).toContain("Email");
  });

  it("maps 'buy' → Errands", () => {
    expect(inferContextsFromText("buy groceries", available)).toContain("Errands");
  });

  it("maps 'meeting' → Meetings", () => {
    expect(inferContextsFromText("team meeting tomorrow", available)).toContain("Meetings");
  });

  it("maps 'code'/'debug'/'commit' → Computer", () => {
    expect(inferContextsFromText("debug the auth flow", available)).toContain("Computer");
    expect(inferContextsFromText("commit the changes", available)).toContain("Computer");
  });

  it("maps 'read' → Reading", () => {
    expect(inferContextsFromText("read the research paper", available)).toContain("Reading");
  });

  it("maps 'waiting for' → Waiting", () => {
    expect(inferContextsFromText("waiting for Alice to respond", available)).toContain("Waiting");
  });

  it("maps 'write'/'draft' → Computer", () => {
    expect(inferContextsFromText("draft the spec document", available)).toContain("Computer");
  });
});

describe("inferContextsFromText — only returns contexts present in availableContextNames", () => {
  it("does not return a context that is not in the available list", () => {
    const result = inferContextsFromText("call dentist", ["Email", "Errands"]);
    expect(result).not.toContain("Calls");
  });

  it("is case-insensitive when matching available context names", () => {
    const result = inferContextsFromText("call dentist", ["calls"]);
    expect(result).toContain("calls");
  });
});

describe("inferContextsFromText — deduplication", () => {
  it("returns each matching context only once even if multiple keywords trigger it", () => {
    const available = ["Computer"];
    const result = inferContextsFromText("write and commit the code and debug it", available);
    expect(result.filter((c) => c === "Computer")).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { iframeSandbox } from "../embed-extension";
import type { EmbedProvider } from "@/core/notes/embed-providers";

const REQUIRED_SANDBOX = "allow-scripts allow-same-origin allow-presentation";

describe("iframeSandbox", () => {
  it("returns the required sandbox string for all providers", () => {
    const providers: (EmbedProvider | null)[] = [
      "youtube",
      "vimeo",
      "spotify",
      "soundcloud",
      "twitter",
      "github_gist",
      "codesandbox",
      "loom",
      null,
    ];
    for (const provider of providers) {
      expect(iframeSandbox(provider)).toBe(REQUIRED_SANDBOX);
    }
  });

  it("sandbox always includes allow-scripts", () => {
    expect(iframeSandbox("youtube")).toContain("allow-scripts");
  });

  it("sandbox always includes allow-same-origin", () => {
    expect(iframeSandbox("github_gist")).toContain("allow-same-origin");
  });

  it("sandbox always includes allow-presentation", () => {
    expect(iframeSandbox("loom")).toContain("allow-presentation");
  });

  it("github_gist uses the same sandbox as other providers", () => {
    expect(iframeSandbox("github_gist")).toBe(iframeSandbox("youtube"));
  });

  it("null provider returns the required sandbox string", () => {
    expect(iframeSandbox(null)).toBe(REQUIRED_SANDBOX);
  });
});

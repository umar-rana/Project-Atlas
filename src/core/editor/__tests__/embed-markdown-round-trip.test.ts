import { describe, it, expect } from "vitest";
import { tiptapToMarkdown } from "../markdown-export";
import { markdownToTiptap } from "../markdown-import";

const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YOUTUBE_EMBED = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const VIMEO_URL = "https://vimeo.com/123456789";
const LOOM_URL = "https://www.loom.com/share/abc123def456";
const CODESANDBOX_URL = "https://codesandbox.io/s/react-new-8ll63";

describe("tiptapToMarkdown — embed node serialization", () => {
  it("emits [Title](url) for embed with title", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: {
            provider: "youtube",
            url: YOUTUBE_URL,
            embed_url: YOUTUBE_EMBED,
            title: "Never Gonna Give You Up",
            thumbnail_url: "",
          },
        },
      ],
    };
    const md = tiptapToMarkdown(doc);
    expect(md).toBe("[Never Gonna Give You Up](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
  });

  it("uses 'Embed' as fallback title when title is empty", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: {
            provider: "vimeo",
            url: VIMEO_URL,
            embed_url: "https://player.vimeo.com/video/123456789",
            title: "",
            thumbnail_url: "",
          },
        },
      ],
    };
    const md = tiptapToMarkdown(doc);
    expect(md).toBe(`[Embed](${VIMEO_URL})`);
  });

  it("separates multiple embeds with blank lines", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: { provider: "youtube", url: YOUTUBE_URL, embed_url: YOUTUBE_EMBED, title: "Vid A", thumbnail_url: "" },
        },
        {
          type: "embed",
          attrs: { provider: "loom", url: LOOM_URL, embed_url: "https://www.loom.com/embed/abc123def456", title: "Vid B", thumbnail_url: "" },
        },
      ],
    };
    const md = tiptapToMarkdown(doc);
    expect(md).toContain("[Vid A](");
    expect(md).toContain("[Vid B](");
    expect(md).toContain("\n\n");
  });
});

describe("markdownToTiptap — embed node reconstruction", () => {
  it("reconstructs embed node from standalone YouTube link line", () => {
    const md = `[My Video](${YOUTUBE_URL})`;
    const doc = markdownToTiptap(md);
    const node = doc.content.find((n) => n.type === "embed");
    expect(node).toBeDefined();
    expect(node!.attrs!["provider"]).toBe("youtube");
    expect(node!.attrs!["url"]).toBe(YOUTUBE_URL);
    expect(node!.attrs!["embed_url"]).toBe(YOUTUBE_EMBED);
    expect(node!.attrs!["title"]).toBe("My Video");
  });

  it("reconstructs embed node from standalone Vimeo link line", () => {
    const doc = markdownToTiptap(`[Nice Talk](${VIMEO_URL})`);
    const node = doc.content.find((n) => n.type === "embed");
    expect(node).toBeDefined();
    expect(node!.attrs!["provider"]).toBe("vimeo");
    expect(node!.attrs!["embed_url"]).toContain("player.vimeo.com/video/123456789");
  });

  it("reconstructs embed node from standalone Loom link line", () => {
    const doc = markdownToTiptap(`[Screen Recording](${LOOM_URL})`);
    const node = doc.content.find((n) => n.type === "embed");
    expect(node).toBeDefined();
    expect(node!.attrs!["provider"]).toBe("loom");
  });

  it("reconstructs embed node from standalone CodeSandbox link line", () => {
    const doc = markdownToTiptap(`[My Sandbox](${CODESANDBOX_URL})`);
    const node = doc.content.find((n) => n.type === "embed");
    expect(node).toBeDefined();
    expect(node!.attrs!["provider"]).toBe("codesandbox");
  });

  it("does NOT reconstruct embed for plain non-whitelisted link", () => {
    const doc = markdownToTiptap("[Example](https://www.example.com/page)");
    const embedNode = doc.content.find((n) => n.type === "embed");
    expect(embedNode).toBeUndefined();
    const paraNode = doc.content.find((n) => n.type === "paragraph");
    expect(paraNode).toBeDefined();
  });

  it("reconstructs embed from a standalone link on its own paragraph line", () => {
    const md = `Some text\n\n[Watch this](${YOUTUBE_URL})\n\nMore text`;
    const doc = markdownToTiptap(md);
    const embedNode = doc.content.find((n) => n.type === "embed");
    expect(embedNode).toBeDefined();
    expect(embedNode!.attrs!["provider"]).toBe("youtube");
  });

  it("does NOT reconstruct embed when link is mixed with other text on the same line", () => {
    const md = `Check out [this video](${YOUTUBE_URL}) for more`;
    const doc = markdownToTiptap(md);
    const embedNode = doc.content.find((n) => n.type === "embed");
    expect(embedNode).toBeUndefined();
    const paraNode = doc.content.find((n) => n.type === "paragraph");
    expect(paraNode).toBeDefined();
  });

  it("handles markdown with surrounding paragraphs and an embed", () => {
    const md = `# Heading\n\nSome intro text.\n\n[My Video](${YOUTUBE_URL})\n\nConclusion.`;
    const doc = markdownToTiptap(md);
    const embedNode = doc.content.find((n) => n.type === "embed");
    expect(embedNode).toBeDefined();
    const heading = doc.content.find((n) => n.type === "heading");
    expect(heading).toBeDefined();
  });

  it("preserves thumbnail_url as empty string (not set during import)", () => {
    const doc = markdownToTiptap(`[Video](${YOUTUBE_URL})`);
    const node = doc.content.find((n) => n.type === "embed");
    expect(node!.attrs!["thumbnail_url"]).toBe("");
  });
});

describe("full markdown round-trip", () => {
  it("exports and re-imports a YouTube embed preserving attributes", () => {
    const originalDoc = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: {
            provider: "youtube",
            url: YOUTUBE_URL,
            embed_url: YOUTUBE_EMBED,
            title: "Rick Astley",
            thumbnail_url: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          },
        },
      ],
    };

    const md = tiptapToMarkdown(originalDoc);
    const reimported = markdownToTiptap(md);

    const node = reimported.content.find((n) => n.type === "embed");
    expect(node).toBeDefined();
    expect(node!.attrs!["provider"]).toBe("youtube");
    expect(node!.attrs!["url"]).toBe(YOUTUBE_URL);
    expect(node!.attrs!["embed_url"]).toBe(YOUTUBE_EMBED);
    expect(node!.attrs!["title"]).toBe("Rick Astley");
  });

  it("exports and re-imports a document with mixed content and embed", () => {
    const originalDoc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resources" }] },
        { type: "paragraph", content: [{ type: "text", text: "Watch the intro:" }] },
        {
          type: "embed",
          attrs: {
            provider: "vimeo",
            url: VIMEO_URL,
            embed_url: "https://player.vimeo.com/video/123456789",
            title: "Intro Video",
            thumbnail_url: "",
          },
        },
        { type: "paragraph", content: [{ type: "text", text: "End of section." }] },
      ],
    };

    const md = tiptapToMarkdown(originalDoc);
    const reimported = markdownToTiptap(md);

    const embedNode = reimported.content.find((n) => n.type === "embed");
    expect(embedNode).toBeDefined();
    expect(embedNode!.attrs!["provider"]).toBe("vimeo");

    const heading = reimported.content.find((n) => n.type === "heading");
    expect(heading).toBeDefined();
  });
});

import "server-only";
import { marked, type Token, type TokensList } from "marked";

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapDocument {
  type: "doc";
  content: TiptapNode[];
}

/**
 * Converts a marked inline token list to TipTap inline nodes.
 */
function inlineTokensToNodes(tokens: Token[]): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  for (const token of tokens) {
    if (token.type === "text") {
      const t = token as { type: "text"; text: string; tokens?: Token[] };
      if (t.tokens && t.tokens.length > 0) {
        nodes.push(...inlineTokensToNodes(t.tokens));
      } else {
        nodes.push({ type: "text", text: t.text });
      }
    } else if (token.type === "strong") {
      const t = token as { type: "strong"; tokens: Token[] };
      const children = inlineTokensToNodes(t.tokens);
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks ?? []), { type: "bold" }],
        });
      }
    } else if (token.type === "em") {
      const t = token as { type: "em"; tokens: Token[] };
      const children = inlineTokensToNodes(t.tokens);
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks ?? []), { type: "italic" }],
        });
      }
    } else if (token.type === "del") {
      const t = token as { type: "del"; tokens: Token[] };
      const children = inlineTokensToNodes(t.tokens);
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks ?? []), { type: "strike" }],
        });
      }
    } else if (token.type === "codespan") {
      const t = token as { type: "codespan"; text: string };
      nodes.push({
        type: "text",
        text: t.text,
        marks: [{ type: "code" }],
      });
    } else if (token.type === "link") {
      const t = token as { type: "link"; href: string; tokens: Token[] };
      const children = inlineTokensToNodes(t.tokens);
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks ?? []), { type: "link", attrs: { href: t.href, target: "_blank" } }],
        });
      }
    } else if (token.type === "image") {
      const t = token as { type: "image"; href: string; text: string };
      nodes.push({
        type: "image",
        attrs: { src: t.href, alt: t.text ?? "" },
      });
    } else if (token.type === "br") {
      nodes.push({ type: "hardBreak" });
    } else if ("text" in token && typeof (token as { text: string }).text === "string") {
      nodes.push({ type: "text", text: (token as { text: string }).text });
    }
  }

  return nodes;
}

/**
 * Converts a list of marked block tokens to TipTap block nodes.
 */
function tokensToNodes(tokens: TokensList | Token[]): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  for (const token of tokens) {
    if (token.type === "heading") {
      const t = token as { type: "heading"; depth: number; tokens: Token[] };
      nodes.push({
        type: "heading",
        attrs: { level: t.depth },
        content: inlineTokensToNodes(t.tokens),
      });
    } else if (token.type === "paragraph") {
      const t = token as { type: "paragraph"; tokens: Token[] };
      const children = inlineTokensToNodes(t.tokens);
      nodes.push({
        type: "paragraph",
        content: children.length > 0 ? children : undefined,
      });
    } else if (token.type === "code") {
      const t = token as { type: "code"; text: string; lang?: string };
      nodes.push({
        type: "codeBlock",
        attrs: { language: t.lang ?? null },
        content: [{ type: "text", text: t.text }],
      });
    } else if (token.type === "blockquote") {
      const t = token as { type: "blockquote"; tokens: Token[] };
      const innerNodes = tokensToNodes(t.tokens);
      nodes.push({
        type: "blockquote",
        content: innerNodes.length > 0 ? innerNodes : [{ type: "paragraph" }],
      });
    } else if (token.type === "list") {
      const t = token as { type: "list"; ordered: boolean; items: { tokens: Token[]; task: boolean; checked?: boolean }[] };
      const listType = t.ordered ? "orderedList" : "bulletList";
      nodes.push({
        type: listType,
        content: t.items.map((item) => {
          const itemContent = tokensToNodes(item.tokens);
          if (item.task) {
            return {
              type: "taskItem",
              attrs: { checked: item.checked ?? false },
              content: itemContent.length > 0 ? itemContent : [{ type: "paragraph" }],
            };
          }
          return {
            type: "listItem",
            content: itemContent.length > 0 ? itemContent : [{ type: "paragraph" }],
          };
        }),
      });
    } else if (token.type === "hr") {
      nodes.push({ type: "horizontalRule" });
    } else if (token.type === "table") {
      const t = token as {
        type: "table";
        header: { tokens: Token[] }[];
        rows: { tokens: Token[] }[][];
      };
      nodes.push({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: t.header.map((cell) => ({
              type: "tableHeader",
              content: [{ type: "paragraph", content: inlineTokensToNodes(cell.tokens) }],
            })),
          },
          ...t.rows.map((row) => ({
            type: "tableRow",
            content: row.map((cell) => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: inlineTokensToNodes(cell.tokens) }],
            })),
          })),
        ],
      });
    } else if (token.type === "html") {
      const t = token as { type: "html"; text: string };
      const stripped = t.text.replace(/<[^>]*>/g, "").trim();
      if (stripped) {
        nodes.push({ type: "paragraph", content: [{ type: "text", text: stripped }] });
      }
    } else if (token.type === "space") {
      // skip
    }
  }

  return nodes;
}

/**
 * Returns true if a TipTap node tree contains at least one non-empty text leaf.
 */
function hasTextContent(nodes: TiptapNode[]): boolean {
  for (const node of nodes) {
    if (node.text && node.text.length > 0) return true;
    if (node.content && hasTextContent(node.content)) return true;
  }
  return false;
}

/**
 * Converts a markdown string to a TipTap document JSON object.
 * Always returns a document with at least one paragraph node.
 * If conversion produces no text content, falls back to plain-text paragraphs
 * derived directly from the raw markdown.
 */
export function markdownToTiptap(markdown: string): TiptapDocument {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const lexer = new marked.Lexer();
  const tokens = lexer.lex(markdown);
  const nodes = tokensToNodes(tokens);

  if (nodes.length > 0 && hasTextContent(nodes)) {
    return { type: "doc", content: nodes };
  }

  const fallbackParagraphs = trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: "paragraph" as const,
      content: [{ type: "text", text: block }],
    }));

  return {
    type: "doc",
    content: fallbackParagraphs.length > 0 ? fallbackParagraphs : [{ type: "paragraph" }],
  };
}

/**
 * Extracts plain text from a TipTap document JSON string.
 */
export function tiptapToPlainText(doc: TiptapDocument | string): string {
  let parsed: TiptapDocument;
  if (typeof doc === "string") {
    try {
      parsed = JSON.parse(doc) as TiptapDocument;
    } catch {
      return doc;
    }
  } else {
    parsed = doc;
  }

  function extractText(node: TiptapNode): string {
    if (node.text) return node.text;
    if (node.content) return node.content.map(extractText).join(" ");
    return "";
  }

  return (parsed.content ?? []).map(extractText).join("\n").trim();
}

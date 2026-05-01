type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TiptapNode = {
  type: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
};

type TiptapDocument = {
  type: "doc";
  content: TiptapNode[];
};

function parseInline(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  const patterns: Array<{ re: RegExp; handler: (m: RegExpExecArray) => TiptapNode | null }> = [
    {
      re: /\[\[([^\]|]+)\|([^|\]]+)(?:\|([^\]]+))?\]\]/g,
      handler: (m) => ({
        type: "reference",
        attrs: {
          target_type: m[3] ?? "note",
          target_id: m[2] ?? "",
          display_text: m[1] ?? "",
        },
      }),
    },
    {
      re: /\[\[([^\]]+)\]\]/g,
      handler: (m) => ({
        type: "reference",
        attrs: { target_type: "note", target_id: "", display_text: m[1] ?? "" },
      }),
    },
    {
      re: /#([a-zA-Z0-9_-]+)/g,
      handler: (m) => ({
        type: "reference",
        attrs: { target_type: "tag", target_id: "", display_text: m[1] ?? "" },
      }),
    },
    {
      re: /@([a-zA-Z0-9_-]+)/g,
      handler: (m) => ({
        type: "reference",
        attrs: { target_type: "context", target_id: "", display_text: m[1] ?? "" },
      }),
    },
    {
      re: /\*\*(.+?)\*\*/g,
      handler: (m) => ({
        type: "text",
        text: m[1] ?? "",
        marks: [{ type: "bold" }],
      }),
    },
    {
      re: /_(.+?)_/g,
      handler: (m) => ({
        type: "text",
        text: m[1] ?? "",
        marks: [{ type: "italic" }],
      }),
    },
    {
      re: /~~(.+?)~~/g,
      handler: (m) => ({
        type: "text",
        text: m[1] ?? "",
        marks: [{ type: "strike" }],
      }),
    },
    {
      re: /`([^`]+)`/g,
      handler: (m) => ({
        type: "text",
        text: m[1] ?? "",
        marks: [{ type: "code" }],
      }),
    },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/g,
      handler: (m) => ({
        type: "text",
        text: m[1] ?? "",
        marks: [{ type: "link", attrs: { href: m[2] ?? "" } }],
      }),
    },
  ];

  let remaining = text;
  let safety = 0;

  while (remaining.length > 0 && safety < 10000) {
    safety++;
    let earliest: { index: number; length: number; node: TiptapNode } | null = null;

    for (const { re, handler } of patterns) {
      re.lastIndex = 0;
      const m = re.exec(remaining);
      if (m && (!earliest || m.index < earliest.index)) {
        const node = handler(m);
        if (node) {
          earliest = { index: m.index, length: m[0].length, node };
        }
      }
    }

    if (!earliest) {
      nodes.push({ type: "text", text: remaining });
      break;
    }

    if (earliest.index > 0) {
      nodes.push({ type: "text", text: remaining.slice(0, earliest.index) });
    }
    nodes.push(earliest.node);
    remaining = remaining.slice(earliest.index + earliest.length);
  }

  return nodes;
}

function parseBlock(line: string): TiptapNode | null {
  const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
  if (headingMatch) {
    const hashes = headingMatch[1] ?? "";
    const headingText = headingMatch[2] ?? "";
    return {
      type: "heading",
      attrs: { level: hashes.length },
      content: parseInline(headingText),
    };
  }

  if (/^---$/.test(line.trim())) {
    return { type: "horizontalRule" };
  }

  return null;
}

export function markdownToTiptap(markdown: string): TiptapDocument {
  const lines = markdown.split("\n");
  const content: TiptapNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i++;
      continue;
    }

    const blockquoteLines: string[] = [];
    if (/^> /.test(line)) {
      while (i < lines.length && /^> /.test(lines[i] ?? "")) {
        blockquoteLines.push((lines[i] ?? "").slice(2));
        i++;
      }
      const inner = markdownToTiptap(blockquoteLines.join("\n"));
      content.push({ type: "blockquote", content: inner.content });
      continue;
    }

    const codeBlockMatch = /^```(\w*)$/.exec(line);
    if (codeBlockMatch) {
      const lang = codeBlockMatch[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++;
      content.push({
        type: "codeBlock",
        attrs: { language: lang || null },
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    const blockNode = parseBlock(line);
    if (blockNode) {
      content.push(blockNode);
      i++;
      continue;
    }

    const bulletItems: TiptapNode[] = [];
    const orderedItems: TiptapNode[] = [];
    const taskItems: TiptapNode[] = [];
    let listType: "bullet" | "ordered" | "task" | null = null;

    while (i < lines.length) {
      const l = lines[i] ?? "";
      const taskMatch = /^(\s*)- \[( |x)\] (.*)$/.exec(l);
      const bulletMatch = /^(\s*)[*-] (.*)$/.exec(l);
      const orderedMatch = /^(\s*)\d+\. (.*)$/.exec(l);

      if (taskMatch) {
        if (listType !== null && listType !== "task") break;
        listType = "task";
        taskItems.push({
          type: "taskItem",
          attrs: { checked: (taskMatch[2] ?? " ") === "x" },
          content: [{ type: "paragraph", content: parseInline(taskMatch[3] ?? "") }],
        });
        i++;
      } else if (orderedMatch) {
        if (listType !== null && listType !== "ordered") break;
        listType = "ordered";
        orderedItems.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(orderedMatch[2] ?? "") }],
        });
        i++;
      } else if (bulletMatch) {
        if (listType !== null && listType !== "bullet") break;
        listType = "bullet";
        bulletItems.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(bulletMatch[2] ?? "") }],
        });
        i++;
      } else {
        break;
      }
    }

    if (listType === "task" && taskItems.length > 0) {
      content.push({ type: "taskList", content: taskItems });
      continue;
    }
    if (listType === "ordered" && orderedItems.length > 0) {
      content.push({ type: "orderedList", content: orderedItems });
      continue;
    }
    if (listType === "bullet" && bulletItems.length > 0) {
      content.push({ type: "bulletList", content: bulletItems });
      continue;
    }

    content.push({
      type: "paragraph",
      content: parseInline(line),
    });
    i++;
  }

  if (content.length === 0) {
    content.push({ type: "paragraph", content: [] });
  }

  return { type: "doc", content };
}

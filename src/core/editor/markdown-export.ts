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
  type: string;
  content?: TiptapNode[];
};

function applyMarks(text: string, marks: TiptapMark[]): string {
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        result = `**${result}**`;
        break;
      case "italic":
        result = `_${result}_`;
        break;
      case "strike":
        result = `~~${result}~~`;
        break;
      case "underline":
        break;
      case "code":
        result = `\`${result}\``;
        break;
      case "link": {
        const href = (mark.attrs?.href as string) ?? "#";
        result = `[${result}](${href})`;
        break;
      }
    }
  }
  return result;
}

function nodeToMarkdown(node: TiptapNode, listDepth = 0, ordered = false, index = 0): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map((n) => nodeToMarkdown(n, 0)).join("\n\n");

    case "paragraph": {
      if (!node.content || node.content.length === 0) return "";
      return (node.content ?? []).map((n) => nodeToMarkdown(n, listDepth)).join("");
    }

    case "text": {
      const raw = node.text ?? "";
      if (!node.marks || node.marks.length === 0) return raw;
      return applyMarks(raw, node.marks);
    }

    case "hardBreak":
      return "  \n";

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = "#".repeat(level);
      const content = (node.content ?? []).map((n) => nodeToMarkdown(n, listDepth)).join("");
      return `${prefix} ${content}`;
    }

    case "blockquote": {
      const inner = (node.content ?? []).map((n) => nodeToMarkdown(n, listDepth)).join("\n\n");
      return inner
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    }

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "bulletList": {
      return (node.content ?? [])
        .map((n) => nodeToMarkdown(n, listDepth, false))
        .join("\n");
    }

    case "orderedList": {
      return (node.content ?? [])
        .map((n, i) => nodeToMarkdown(n, listDepth, true, i + 1))
        .join("\n");
    }

    case "listItem": {
      const indent = "  ".repeat(listDepth);
      const bullet = ordered ? `${index}.` : "-";
      const children = (node.content ?? [])
        .map((n) => {
          if (n.type === "bulletList" || n.type === "orderedList") {
            return "\n" + nodeToMarkdown(n, listDepth + 1, n.type === "orderedList");
          }
          return nodeToMarkdown(n, listDepth + 1);
        })
        .join("");
      return `${indent}${bullet} ${children}`;
    }

    case "taskList": {
      return (node.content ?? [])
        .map((n) => nodeToMarkdown(n, listDepth))
        .join("\n");
    }

    case "taskItem": {
      const indent = "  ".repeat(listDepth);
      const checked = (node.attrs?.checked as boolean) ? "x" : " ";
      const children = (node.content ?? [])
        .map((n) => {
          if (n.type === "taskList" || n.type === "bulletList" || n.type === "orderedList") {
            return "\n" + nodeToMarkdown(n, listDepth + 1);
          }
          return nodeToMarkdown(n, listDepth + 1);
        })
        .join("");
      return `${indent}- [${checked}] ${children}`;
    }

    case "horizontalRule":
      return "---";

    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})`;
    }

    case "reference": {
      const displayText = (node.attrs?.display_text as string) ?? "";
      const targetType = (node.attrs?.target_type as string) ?? "note";
      const targetId = (node.attrs?.target_id as string) ?? "";
      if (targetType === "tag") return `#${displayText}`;
      if (targetType === "context") return `@${displayText}`;
      return `[[${displayText}|${targetId}|${targetType}]]`;
    }

    case "embed": {
      const title = (node.attrs?.title as string) || "Embed";
      const url = (node.attrs?.url as string) ?? "";
      return `[${title}](${url})`;
    }

    default:
      if (node.content) {
        return (node.content ?? []).map((n) => nodeToMarkdown(n, listDepth)).join("");
      }
      return "";
  }
}

export function tiptapToMarkdown(doc: TiptapDocument | string): string {
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

  if (!parsed || !parsed.content) return "";

  return (parsed.content ?? [])
    .map((n) => nodeToMarkdown(n, 0))
    .filter((s) => s.length > 0)
    .join("\n\n")
    .trim();
}

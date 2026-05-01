type TiptapNode = {
  type: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

type TiptapDocument = {
  type: string;
  content?: TiptapNode[];
};

function extractNodeText(node: TiptapNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "reference") {
    return (node.attrs?.display_text as string) ?? "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  if (!node.content || node.content.length === 0) {
    return "";
  }

  const childText = node.content.map(extractNodeText).join("");

  const blockTypes = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "codeBlock",
    "bulletList",
    "orderedList",
    "taskList",
    "listItem",
    "taskItem",
    "horizontalRule",
  ]);

  if (blockTypes.has(node.type)) {
    return childText + "\n";
  }

  return childText;
}

export function extractPlainText(doc: TiptapDocument | string): string {
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

  return parsed.content
    .map(extractNodeText)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

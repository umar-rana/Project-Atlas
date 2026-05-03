import "server-only";

export type ClaudeImportMode = "single" | "assistant_only" | "plain";

export interface ClaudeSegment {
  role: "human" | "assistant";
  content: string;
}

/**
 * Parses a Claude conversation export into segments.
 */
export function parseClaudeConversation(content: string): ClaudeSegment[] {
  const segments: ClaudeSegment[] = [];

  // Try to detect format: "Human:" / "Assistant:" on their own lines
  // or **Human**: / **Assistant**: inline
  const blockSplit = content.split(/^(?:Human|User|Assistant|Claude):\s*$/m);
  const headerPattern = /^(Human|User|Assistant|Claude):\s*$/m;
  const inlinePattern = /\*\*(Human|User|Assistant|Claude)\*\*:\s*/g;

  // Check for block format
  const hasBlockFormat = headerPattern.test(content);
  // Check for inline bold format
  const hasInlineFormat = /\*\*(Human|User|Assistant|Claude)\*\*:/.test(content);

  if (hasBlockFormat) {
    // Split by role headers
    const parts = content.split(/^(Human|User|Assistant|Claude):\s*$/m);
    let currentRole: "human" | "assistant" | null = null;
    for (const part of parts) {
      const trimmed = part.trim();
      if (/^(Human|User)$/i.test(trimmed)) {
        currentRole = "human";
      } else if (/^(Assistant|Claude)$/i.test(trimmed)) {
        currentRole = "assistant";
      } else if (currentRole && trimmed) {
        segments.push({ role: currentRole, content: trimmed });
      }
    }
  } else if (hasInlineFormat) {
    // Split by **Human**: or **Assistant**:
    const parts = content.split(/\*\*(Human|User|Assistant|Claude)\*\*:\s*/);
    let currentRole: "human" | "assistant" | null = null;
    for (const part of parts) {
      const trimmed = part.trim();
      if (/^(Human|User)$/i.test(trimmed)) {
        currentRole = "human";
      } else if (/^(Assistant|Claude)$/i.test(trimmed)) {
        currentRole = "assistant";
      } else if (currentRole && trimmed) {
        segments.push({ role: currentRole, content: trimmed });
      }
    }
  }

  return segments;
}

/**
 * Converts a Claude conversation to markdown based on import mode.
 */
export function claudeConversationToMarkdown(
  segments: ClaudeSegment[],
  mode: ClaudeImportMode,
): string {
  if (mode === "plain") {
    // Treat as plain markdown — return original content
    return segments.map((s) => s.content).join("\n\n");
  }

  if (mode === "assistant_only") {
    // Only assistant responses
    return segments
      .filter((s) => s.role === "assistant")
      .map((s) => s.content)
      .join("\n\n---\n\n");
  }

  // "single" — full conversation with role headers
  return segments
    .map((s) => {
      const header = s.role === "human" ? "**You**" : "**Claude**";
      return `${header}\n\n${s.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Detects the source format of a markdown file's content.
 * Returns "notion" | "claude" | "plain".
 */

export type MarkdownSourceFormat = "notion" | "claude" | "plain";

/**
 * Notion exports include a specific pattern:
 * - Often start with a title (H1) followed by metadata properties
 * - Contain Notion CDN image URLs (e.g., prod-files-secure.s3.us-west-2.amazonaws.com)
 * - May have notion.so links
 */
function isNotionExport(content: string): boolean {
  const notionCdnPattern = /prod-files-secure\.s3\.us-west-2\.amazonaws\.com/;
  const notionSoPattern = /notion\.so\/[a-z0-9-]+\/[a-z0-9-]+/i;
  const notionPropertyPattern = /^[A-Z][a-zA-Z ]+:\s+.+$/m;

  // Notion exports often have properties like "Status: In Progress" near the top
  const first500 = content.slice(0, 500);
  const hasNotionProperties = notionPropertyPattern.test(first500);

  return (
    notionCdnPattern.test(content) ||
    notionSoPattern.test(content) ||
    (hasNotionProperties && /^# .+/m.test(first500))
  );
}

/**
 * Claude conversation exports have a recognizable structure:
 * - Alternating Human/Assistant sections
 * - Often have "Human:" or "User:" prefixes
 */
function isClaudeConversation(content: string): boolean {
  const humanPattern = /^(Human|User):\s*$/m;
  const assistantPattern = /^(Assistant|Claude):\s*$/m;
  const humanInlinePattern = /^\*\*(Human|User)\*\*:\s/m;
  const assistantInlinePattern = /^\*\*(Assistant|Claude)\*\*:\s/m;

  const hasHuman = humanPattern.test(content) || humanInlinePattern.test(content);
  const hasAssistant = assistantPattern.test(content) || assistantInlinePattern.test(content);

  return hasHuman && hasAssistant;
}

export function detectMarkdownFormat(content: string): MarkdownSourceFormat {
  if (isClaudeConversation(content)) return "claude";
  if (isNotionExport(content)) return "notion";
  return "plain";
}

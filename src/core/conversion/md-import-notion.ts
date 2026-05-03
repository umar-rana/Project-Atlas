import "server-only";

export interface NotionImportResult {
  processedMarkdown: string;
  warnings: string[];
}

/**
 * Process Notion-exported markdown:
 * - Strip the leading title H1 (Notion duplicates the page title as H1)
 * - Warn about CDN expiring image URLs
 * - Convert internal Notion links to plain text
 */
export function processNotionMarkdown(content: string): NotionImportResult {
  const warnings: string[] = [];
  let processed = content;

  // Check for CDN images that will expire
  const notionCdnPattern = /prod-files-secure\.s3\.us-west-2\.amazonaws\.com/;
  if (notionCdnPattern.test(processed)) {
    warnings.push(
      "This Notion export contains images hosted on Notion's CDN. These URLs expire and images may stop loading. Consider re-uploading images to Atlas.",
    );
  }

  // Strip leading H1 (Notion adds the page title as the first heading)
  processed = processed.replace(/^\s*# .+\n*/, "");

  // Convert internal Notion links to plain text: [title](https://notion.so/...)
  processed = processed.replace(
    /\[([^\]]+)\]\(https?:\/\/(?:www\.)?notion\.so\/[^\)]+\)/g,
    "$1",
  );

  // Convert Notion-style property lines near the top (e.g., "Status: In Progress") to blockquote
  // These usually appear before the first paragraph
  const lines = processed.split("\n");
  const processedLines: string[] = [];
  let inProperties = true;
  for (const line of lines) {
    if (inProperties && /^[A-Z][a-zA-Z ]+:\s+.+$/.test(line.trim())) {
      // Convert property to bold key: value format in a paragraph
      processedLines.push(line);
    } else {
      inProperties = false;
      processedLines.push(line);
    }
  }
  processed = processedLines.join("\n");

  return { processedMarkdown: processed.trim(), warnings };
}

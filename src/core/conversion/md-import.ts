import "server-only";
import matter from "gray-matter";
import { markdownToTiptap, tiptapToPlainText } from "./tiptap-converter";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";
import type { TiptapDocument } from "./tiptap-converter";

export interface FrontmatterData {
  title?: string;
  tags?: string | string[];
  created?: string | Date;
  updated?: string | Date;
  [key: string]: unknown;
}

export interface ImportedNote {
  title: string;
  body_json: string;
  body_text: string;
  body_markdown: string;
  source_metadata: Record<string, unknown>;
  warnings: string[];
}

const MD_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB

export function validateMdSize(buffer: Buffer): void {
  if (buffer.byteLength > MD_SIZE_LIMIT) {
    throw new Error(
      `Markdown file is too large (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 5 MB.`,
    );
  }
}

/**
 * Resolves the title from frontmatter → first H1 → filename fallback.
 */
function resolveTitle(
  frontmatter: FrontmatterData,
  markdownBody: string,
  fallbackFilename: string,
): string {
  if (frontmatter.title && typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  // Look for first H1
  const h1Match = markdownBody.match(/^#{1}\s+(.+)$/m);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }

  // Fallback: use filename without extension
  return fallbackFilename.replace(/\.(md|markdown)$/i, "").replace(/[-_]+/g, " ").trim() || "Untitled";
}

/**
 * Extracts tags from frontmatter (handles string or array).
 */
export function extractTags(frontmatter: FrontmatterData): string[] {
  const rawTags = frontmatter.tags;
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) {
    return rawTags.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof rawTags === "string") {
    // Handle comma-separated or single tag
    return rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Builds source_metadata from frontmatter: known fields extracted, extra fields preserved.
 */
function buildSourceMetadata(
  frontmatter: FrontmatterData,
  originalFilename: string,
  importedTags: string[],
  unmatchedTags: string[],
  importedFrom: string,
): Record<string, unknown> {
  const known = new Set(["title", "tags", "created", "updated"]);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!known.has(k)) {
      extra[k] = v;
    }
  }

  return {
    import_source: importedFrom,
    original_filename: originalFilename,
    frontmatter_created: frontmatter.created ?? null,
    frontmatter_updated: frontmatter.updated ?? null,
    imported_tags: importedTags,
    unmatched_tags: unmatchedTags,
    extra_frontmatter: extra,
    imported_at: new Date().toISOString(),
  };
}

/**
 * Imports a plain markdown file and converts it to a note.
 */
export async function importMarkdown(params: {
  buffer: Buffer;
  filename: string;
  importedFrom?: string;
  existingTagNames?: string[];
}): Promise<ImportedNote> {
  validateMdSize(params.buffer);

  const content = params.buffer.toString("utf-8");
  const warnings: string[] = [];

  let frontmatter: FrontmatterData = {};
  let markdownBody = content;

  try {
    const parsed = matter(content);
    frontmatter = parsed.data as FrontmatterData;
    markdownBody = parsed.content;
  } catch {
    warnings.push("Could not parse frontmatter — importing as plain markdown.");
  }

  const title = resolveTitle(frontmatter, markdownBody, params.filename);
  const allTags = extractTags(frontmatter);
  const existingNames = new Set((params.existingTagNames ?? []).map((t) => t.toLowerCase()));
  const importedTags = allTags.filter((t) => existingNames.has(t.toLowerCase()));
  const unmatchedTags = allTags.filter((t) => !existingNames.has(t.toLowerCase()));

  if (unmatchedTags.length > 0) {
    warnings.push(
      `${unmatchedTags.length} tag(s) not found in Atlas and were not imported: ${unmatchedTags.join(", ")}`,
    );
  }

  const doc: TiptapDocument = markdownToTiptap(markdownBody);
  const body_json = JSON.stringify(doc);
  const body_text = tiptapToPlainText(doc);
  const body_markdown = markdownBody;

  const source_metadata = buildSourceMetadata(
    frontmatter,
    params.filename,
    importedTags,
    unmatchedTags,
    params.importedFrom ?? "md",
  );

  return {
    title,
    body_json,
    body_text,
    body_markdown,
    source_metadata,
    warnings,
  };
}

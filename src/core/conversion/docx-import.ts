import "server-only";
import mammoth from "mammoth";
import { markdownToTiptap, tiptapToPlainText } from "./tiptap-converter";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";
import { uploadFile } from "@/core/storage";
import { newId } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "conversion/docx-import" });

const DOCX_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB

export function validateDocxSize(buffer: Buffer): void {
  if (buffer.byteLength > DOCX_SIZE_LIMIT) {
    throw new Error(
      `Word document is too large (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 50 MB.`,
    );
  }
}

export interface DocxImportResult {
  title: string;
  body_json: string;
  body_text: string;
  body_markdown: string;
  source_metadata: Record<string, unknown>;
  warnings: string[];
  extractedImageAttachmentIds: string[];
}

/**
 * Imports a .docx file using Mammoth, extracts images, and converts to TipTap.
 *
 * @param params.noteId - The pre-generated noteId to attach extracted images to.
 *   The caller MUST use this same noteId when creating the note in the DB, so that
 *   image attachments reference a valid parent.
 */
export async function importDocx(params: {
  buffer: Buffer;
  filename: string;
  userId: string;
  noteId: string;
}): Promise<DocxImportResult> {
  validateDocxSize(params.buffer);

  const warnings: string[] = [];
  const extractedImageAttachmentIds: string[] = [];

  // Configure Mammoth with image handler
  const convertResult = await mammoth.convertToHtml(
    { buffer: params.buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          const imageData = await image.read();
          const contentType = image.contentType ?? "image/png";
          const extension = contentType.split("/")[1] ?? "png";
          const imageFilename = `imported-image-${newId()}.${extension}`;

          const uploadResult = await uploadFile({
            userId: params.userId,
            filename: imageFilename,
            contentType,
            data: Buffer.from(imageData),
            parentType: "Note",
            parentId: params.noteId,
          });

          extractedImageAttachmentIds.push(uploadResult.attachmentId);

          const src = `/api/attachments/${uploadResult.attachment.file_id}`;
          return { src };
        } catch (err) {
          log.warn({ err }, "Failed to extract image from docx");
          return { src: "" };
        }
      }),
    },
  );

  // Collect Mammoth warnings
  for (const msg of convertResult.messages) {
    if (msg.type === "warning") {
      let warningText = msg.message;
      if (warningText.includes("footnote")) {
        warningText = "Footnotes were simplified to inline text.";
      } else if (warningText.includes("track")) {
        warningText = "Tracked changes were applied and removed.";
      } else if (warningText.includes("table")) {
        warningText = `Complex table may not render correctly: ${warningText}`;
      }
      warnings.push(warningText);
    }
  }

  // Convert HTML to markdown (simple approach via DOM-like parsing)
  const html = convertResult.value;
  const markdownResult = await htmlToMarkdown(html);

  // Resolve title from filename
  const title = params.filename.replace(/\.docx$/i, "").replace(/[-_]+/g, " ").trim() || "Untitled";

  const doc = markdownToTiptap(markdownResult);
  const body_json = JSON.stringify(doc);
  const body_text = tiptapToPlainText(doc);
  const body_markdown = markdownResult;

  const source_metadata: Record<string, unknown> = {
    import_source: "docx",
    original_filename: params.filename,
    mammoth_warnings: convertResult.messages.map((m) => m.message),
    extracted_image_count: extractedImageAttachmentIds.length,
    imported_at: new Date().toISOString(),
  };

  return {
    title,
    body_json,
    body_text,
    body_markdown,
    source_metadata,
    warnings,
    extractedImageAttachmentIds,
  };
}

/**
 * Simple HTML-to-Markdown converter for Mammoth output.
 * Handles the subset of HTML that Mammoth generates.
 */
async function htmlToMarkdown(html: string): Promise<string> {
  let md = html;

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_m, content: string) => `# ${stripTags(content)}\n`);
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_m, content: string) => `## ${stripTags(content)}\n`);
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_m, content: string) => `### ${stripTags(content)}\n`);
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_m, content: string) => `#### ${stripTags(content)}\n`);
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_m, content: string) => `##### ${stripTags(content)}\n`);
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_m, content: string) => `###### ${stripTags(content)}\n`);

  // Bold and italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "_$1_");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "_$1_");

  // Strikethrough
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<del[^>]*>(.*?)<\/del>/gi, "~~$1~~");

  // Code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, (_m, content: string) => `\`\`\`\n${stripTags(content)}\n\`\`\`\n`);

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // Lists
  md = md.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_match: string, content: string) => {
    return content.replace(/<li[^>]*>(.*?)<\/li>/gis, (_m: string, item: string) => `- ${stripTags(item).trim()}\n`);
  });
  md = md.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_match: string, content: string) => {
    let i = 1;
    return content.replace(/<li[^>]*>(.*?)<\/li>/gis, (_m: string, item: string) => `${i++}. ${stripTags(item).trim()}\n`);
  });

  // Tables
  md = md.replace(/<table[^>]*>(.*?)<\/table>/gis, (_match: string, content: string) => {
    const rows: string[] = [];
    const rowMatches = content.match(/<tr[^>]*>(.*?)<\/tr>/gis) ?? [];
    for (let rowIdx = 0; rowIdx < rowMatches.length; rowIdx++) {
      const rowHtml = rowMatches[rowIdx] as string;
      const cellMatches = rowHtml.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/gis) ?? [];
      const cells = cellMatches.map((cell: string) => stripTags(cell).trim());
      rows.push(`| ${cells.join(" | ")} |`);
      if (rowIdx === 0) {
        rows.push(`| ${cells.map(() => "---").join(" | ")} |`);
      }
    }
    return rows.join("\n") + "\n";
  });

  // Paragraphs and line breaks
  md = md.replace(/<br[^>]*\/?>/gi, "  \n");
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, (_m, content: string) => `${content.trim()}\n\n`);

  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, "\n---\n");

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = md
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Normalize whitespace
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

import "server-only";
import { storage } from "@/core/storage";
import { newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";

const log = createLogger({ module: "conversion/pdf-export" });

export type PageSize = "A4" | "Letter" | "Legal" | "A3";

export interface PdfExportOptions {
  pageSize: PageSize;
  embedImages: boolean;
  includeAttachmentAppendix: boolean;
  includeHeader: boolean;
  includeFooter: boolean;
}

export interface PdfExportResult {
  storagePath: string;
  signedUrl: string;
  expiresAt: Date;
}

/**
 * Generates a PDF from note content using pdfkit.
 * Stores the result in R2 at users/{userId}/exports/{exportId}/{slug}.pdf
 * with a 24-hour TTL. Returns a signed URL.
 */
export async function exportNoteToPdf(params: {
  noteId: string;
  userId: string;
  title: string;
  bodyJson: string;
  options: PdfExportOptions;
  attachmentFilenames?: string[];
}): Promise<PdfExportResult> {
  const { title, bodyJson, options, userId, noteId } = params;

  // Convert TipTap JSON to markdown for text extraction
  const markdown = tiptapToMarkdown(bodyJson);

  // Generate PDF using pdfkit
  const pdfBuffer = await generatePdf({
    title,
    markdown,
    options,
    attachmentFilenames: params.attachmentFilenames ?? [],
    exportedAt: new Date(),
  });

  // Store in R2
  const exportId = newId();
  const slug = slugify(title) || "note";
  const storagePath = `users/${userId}/exports/${exportId}/${slug}.pdf`;

  await storage.upload({
    path: storagePath,
    data: pdfBuffer,
    contentType: "application/pdf",
  });

  // Signed URL with 24-hour TTL
  const expiresInSeconds = 24 * 60 * 60;
  const signedUrl = await storage.getUrl({ path: storagePath, expiresInSeconds });

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  log.info({ noteId, userId, storagePath }, "PDF exported successfully");

  return { storagePath, signedUrl, expiresAt };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface PdfGenerationParams {
  title: string;
  markdown: string;
  options: PdfExportOptions;
  attachmentFilenames: string[];
  exportedAt: Date;
}

async function generatePdf(params: PdfGenerationParams): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const { title, markdown, options, attachmentFilenames, exportedAt } = params;
  const pageSize = options.pageSize;

  // Header/footer need bufferedPageRange which requires bufferPages: true
  const needsPageRange = options.includeHeader || options.includeFooter;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: pageSize,
      margins: {
        top: options.includeHeader ? 100 : 72,
        bottom: options.includeFooter ? 100 : 72,
        left: 72,
        right: 72,
      },
      bufferPages: needsPageRange,
      info: {
        Title: title,
        Creator: "Atlas",
        Producer: "Atlas PDF Export",
        CreationDate: exportedAt,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const marginLeft = 72;
    const marginRight = 72;
    const contentWidth = pageWidth - marginLeft - marginRight;

    // Title block
    const titleY = options.includeHeader ? 100 : 72;
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#111111")
      .text(title, marginLeft, titleY, { width: contentWidth });

    doc.moveDown(0.5);

    // Horizontal rule after title
    const yAfterTitle = doc.y;
    doc
      .moveTo(marginLeft, yAfterTitle)
      .lineTo(pageWidth - marginRight, yAfterTitle)
      .strokeColor("#e0e0e0")
      .lineWidth(0.5)
      .stroke();

    doc.moveDown(1);

    // Body content
    renderMarkdownToPdf(doc, markdown, {
      marginLeft,
      contentWidth,
    });

    // Attachment appendix
    if (options.includeAttachmentAppendix && attachmentFilenames.length > 0) {
      doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#111111")
        .text("Attachments", marginLeft, titleY);
      doc.moveDown(0.5);
      for (const filename of attachmentFilenames) {
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#444444")
          .text(`• ${filename}`, marginLeft, doc.y, { width: contentWidth });
        doc.moveDown(0.3);
      }
    }

    // Per-page header and footer (requires bufferPages: true)
    if (needsPageRange) {
      const pages = doc.bufferedPageRange();
      const exportDateStr = exportedAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);
        const pageHeight = doc.page.height;

        // Header: title on the left, date on the right
        if (options.includeHeader) {
          const headerY = 36;
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#999999")
            .text(title, marginLeft, headerY, { width: contentWidth / 2, align: "left" })
            .text("Atlas", marginLeft + contentWidth / 2, headerY, {
              width: contentWidth / 2,
              align: "right",
            });
          doc
            .moveTo(marginLeft, headerY + 14)
            .lineTo(pageWidth - marginRight, headerY + 14)
            .strokeColor("#eeeeee")
            .lineWidth(0.5)
            .stroke();
        }

        // Footer: date on the left, page number on the right
        if (options.includeFooter) {
          const footerY = pageHeight - 50;
          doc
            .moveTo(marginLeft, footerY)
            .lineTo(pageWidth - marginRight, footerY)
            .strokeColor("#eeeeee")
            .lineWidth(0.5)
            .stroke();
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#999999")
            .text(`Exported ${exportDateStr}`, marginLeft, footerY + 6, {
              width: contentWidth / 2,
              align: "left",
            })
            .text(
              `${i - pages.start + 1} / ${pages.count}`,
              marginLeft + contentWidth / 2,
              footerY + 6,
              { width: contentWidth / 2, align: "right" },
            );
        }
      }
    }

    doc.end();
  });
}

interface RenderOptions {
  marginLeft: number;
  contentWidth: number;
}

function renderMarkdownToPdf(doc: PDFKit.PDFDocument, markdown: string, opts: RenderOptions) {
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      const sizes: Record<number, number> = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 11, 6: 10 };
      doc
        .font("Helvetica-Bold")
        .fontSize(sizes[level] ?? 12)
        .fillColor("#111111")
        .text(text, opts.marginLeft, doc.y, { width: opts.contentWidth });
      doc.moveDown(0.4);
      i++;
      continue;
    }

    // Code blocks
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      doc
        .font("Courier")
        .fontSize(9)
        .fillColor("#333333")
        .text(codeLines.join("\n"), opts.marginLeft + 8, doc.y, {
          width: opts.contentWidth - 16,
        });
      doc.moveDown(0.5);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      const y = doc.y;
      doc
        .moveTo(opts.marginLeft, y)
        .lineTo(opts.marginLeft + opts.contentWidth, y)
        .strokeColor("#e0e0e0")
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.5);
      i++;
      continue;
    }

    // Bullet lists
    if (/^[*-]\s+/.test(line)) {
      const text = line.replace(/^[*-]\s+/, "");
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#222222")
        .text(`• ${stripMarkdownInline(text)}`, opts.marginLeft + 12, doc.y, {
          width: opts.contentWidth - 12,
        });
      doc.moveDown(0.2);
      i++;
      continue;
    }

    // Ordered lists
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#222222")
        .text(
          `${orderedMatch[1]}. ${stripMarkdownInline(orderedMatch[2]!)}`,
          opts.marginLeft + 12,
          doc.y,
          {
            width: opts.contentWidth - 12,
          },
        );
      doc.moveDown(0.2);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(11)
        .fillColor("#555555")
        .text(stripMarkdownInline(line.slice(2)), opts.marginLeft + 16, doc.y, {
          width: opts.contentWidth - 16,
        });
      doc.moveDown(0.3);
      i++;
      continue;
    }

    // Paragraph (non-empty)
    if (line.trim()) {
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#222222")
        .text(stripMarkdownInline(line), opts.marginLeft, doc.y, {
          width: opts.contentWidth,
          lineGap: 4,
        });
      doc.moveDown(0.5);
    } else {
      doc.moveDown(0.3);
    }

    i++;
  }
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[Image: $1]");
}

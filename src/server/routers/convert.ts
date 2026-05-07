import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "@/core/db";
import { logActivity } from "@/core/audit";
import { checkTitleConflict, resolveConflict } from "@/core/conversion/conflict-resolver";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";
import { exportNoteToPdf } from "@/core/conversion/pdf-export";
import type { PageSize, PdfExportOptions } from "@/core/conversion/pdf-export";

// In-memory per-user rate limiter for PDF export (5 per minute)
const pdfExportRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkPdfExportRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = pdfExportRateLimit.get(userId);
  if (!entry || entry.resetAt < now) {
    pdfExportRateLimit.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}

export const convertRouter = router({
  /**
   * Check if an import title would conflict with an existing note.
   */
  checkConflict: protectedProcedure
    .input(z.object({ title: z.string() }))
    .query(async ({ ctx, input }) => {
      return checkTitleConflict({ userId: ctx.user.id, title: input.title });
    }),

  /**
   * Resolve a title conflict for an import.
   */
  resolveImportConflict: protectedProcedure
    .input(
      z.object({
        resolution: z.enum(["rename", "replace", "skip"]),
        conflictingNoteId: z.string().uuid().optional(),
        newTitle: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await resolveConflict({
        userId: ctx.user.id,
        resolution: input.resolution,
        conflictingNoteId: input.conflictingNoteId,
        newTitle: input.newTitle,
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: input.conflictingNoteId ?? "unknown",
        action: "import_conflict_resolved",
        meta: {
          resolution: input.resolution,
          new_title: input.newTitle,
        },
      });

      return result;
    }),

  /**
   * Export a note as PDF.
   * Generates the PDF synchronously and returns a signed R2 URL (valid 24h).
   * Ownership is enforced via protectedProcedure context.
   * Rate-limited to 5 exports per minute per user.
   */
  exportPdf: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        pageSize: z.enum(["A4", "Letter", "Legal", "A3"]).default("A4"),
        embedImages: z.boolean().default(false),
        includeAttachmentAppendix: z.boolean().default(false),
        includeHeader: z.boolean().default(true),
        includeFooter: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!checkPdfExportRateLimit(ctx.user.id)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded. Maximum 5 PDF exports per minute.",
        });
      }

      const note = await db.note.findFirst({
        where: { id: input.noteId, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, title: true, body_json: true },
      });

      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      const attachments = await db.attachment.findMany({
        where: {
          parent_type: "Note",
          parent_id: input.noteId,
          user_id: ctx.user.id,
          deleted_at: null,
        },
        select: { filename: true },
      });

      const options: PdfExportOptions = {
        pageSize: input.pageSize as PageSize,
        embedImages: input.embedImages,
        includeAttachmentAppendix: input.includeAttachmentAppendix,
        includeHeader: input.includeHeader,
        includeFooter: input.includeFooter,
      };

      const result = await exportNoteToPdf({
        noteId: note.id,
        userId: ctx.user.id,
        title: note.title || "Untitled",
        bodyJson: note.body_json,
        options,
        attachmentFilenames: attachments.map((a) => a.filename),
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: note.id,
        action: "note_export_pdf",
        meta: {
          title: note.title,
          pageSize: options.pageSize,
          storagePath: result.storagePath,
          expiresAt: result.expiresAt.toISOString(),
        },
      });

      return {
        url: result.signedUrl,
        expiresAt: result.expiresAt.toISOString(),
        filename: `${slugify(note.title || "note")}.pdf`,
      };
    }),

  /**
   * Export a note as Markdown with YAML frontmatter.
   * Returns the markdown string and suggested filename.
   * The client is responsible for creating and triggering the file download.
   */
  exportMarkdown: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.noteId, user_id: ctx.user.id, deleted_at: null },
        select: {
          id: true,
          title: true,
          body_json: true,
          purpose: true,
          created_at: true,
          updated_at: true,
          imported_from: true,
          project_id: true,
          folder_id: true,
        },
      });

      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      const body = tiptapToMarkdown(note.body_json);

      // Build YAML frontmatter
      const frontmatterLines: string[] = [
        "---",
        `title: ${JSON.stringify(note.title || "Untitled")}`,
        `purpose: ${note.purpose}`,
        `created_at: ${note.created_at.toISOString()}`,
        `updated_at: ${note.updated_at.toISOString()}`,
      ];
      if (note.project_id) frontmatterLines.push(`project_id: ${note.project_id}`);
      if (note.folder_id) frontmatterLines.push(`folder_id: ${note.folder_id}`);
      if (note.imported_from) frontmatterLines.push(`imported_from: ${note.imported_from}`);
      frontmatterLines.push("exported_by: atlas", "---", "");

      const markdown = [...frontmatterLines, body].join("\n");

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: note.id,
        action: "import_export_md",
        meta: { title: note.title },
      });

      const filename = `${slugify(note.title || "note")}.md`;
      return { markdown, filename, title: note.title };
    }),
});

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { uploadFile } from "@/core/storage";
import { importMarkdown } from "@/core/conversion/md-import";
import { importDocx } from "@/core/conversion/docx-import";
import { detectMarkdownFormat } from "@/core/conversion/format-detector";
import { processNotionMarkdown } from "@/core/conversion/md-import-notion";
import { parseClaudeConversation, claudeConversationToMarkdown } from "@/core/conversion/md-import-claude";
import { checkTitleConflict } from "@/core/conversion/conflict-resolver";
import { createLogger } from "@/core/logging";
import { markdownToTiptap, tiptapToPlainText } from "@/core/conversion/tiptap-converter";

const log = createLogger({ module: "api/convert/import" });

const MD_RATE_LIMIT = 10;

// Simple in-memory rate limiter per user per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit: number): boolean {
  const now = Date.now();
  const key = `import:${userId}`;
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id, MD_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 10 imports per minute." },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const sourceFormat = (formData.get("source_format") as string) ?? "md";
  const folderId = formData.get("folder_id") as string | null;
  const projectId = formData.get("project_id") as string | null;

  // claude_mode is null/absent on first pass → triggers the Claude dialog
  const claudeMode = formData.get("claude_mode") as string | null;
  const conflictResolution = formData.get("conflict_resolution") as string | null;
  const newTitle = formData.get("new_title") as string | null;
  const conflictingNoteId = formData.get("conflicting_note_id") as string | null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;

  try {
    let importResult: {
      title: string;
      body_json: string;
      body_text: string;
      body_markdown: string;
      source_metadata: Record<string, unknown>;
      warnings: string[];
    };

    let detectedFormat: string | null = null;
    let docxNoteId: string | null = null;

    if (sourceFormat === "md") {
      // Validate size
      if (buffer.byteLength > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Markdown file is too large. Maximum allowed size is 5 MB." },
          { status: 400 },
        );
      }

      const content = buffer.toString("utf-8");
      detectedFormat = detectMarkdownFormat(content);

      // If a Claude conversation and mode not yet chosen, prompt the dialog
      if (detectedFormat === "claude" && !claudeMode) {
        const segments = parseClaudeConversation(content);
        return NextResponse.json({
          requiresClaudeDialog: true,
          segmentCount: segments.length,
        });
      }

      let processedContent = content;
      const extraWarnings: string[] = [];

      if (detectedFormat === "notion") {
        const notionResult = processNotionMarkdown(content);
        processedContent = notionResult.processedMarkdown;
        extraWarnings.push(...notionResult.warnings);
      } else if (detectedFormat === "claude") {
        if (claudeMode === "plain") {
          // Plain mode: treat as raw markdown — do not parse conversation structure.
          // This preserves all content even when the parser finds no role-delimited segments.
          processedContent = content;
        } else {
          const segments = parseClaudeConversation(content);
          processedContent = claudeConversationToMarkdown(
            segments,
            (claudeMode as "single" | "assistant_only"),
          );
        }
      }

      const existingTags = await db.tag.findMany({
        where: { user_id: user.id, deleted_at: null },
        select: { name: true },
      });

      importResult = await importMarkdown({
        buffer: Buffer.from(processedContent),
        filename,
        importedFrom: detectedFormat === "notion" ? "notion_md" : detectedFormat === "claude" ? "claude_md" : "md",
        existingTagNames: existingTags.map((t) => t.name),
      });
      importResult.warnings.push(...extraWarnings);
    } else if (sourceFormat === "docx") {
      // Validate size
      if (buffer.byteLength > 50 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Word document is too large. Maximum allowed size is 50 MB." },
          { status: 400 },
        );
      }

      // Pre-generate a stable noteId so embedded images attach to the right note
      docxNoteId = newId();
      importResult = await importDocx({
        buffer,
        filename,
        userId: user.id,
        noteId: docxNoteId,
      });
    } else {
      return NextResponse.json({ error: "Unsupported source format" }, { status: 400 });
    }

    // Validate folder/project if provided (always scoped by user)
    if (folderId) {
      const folder = await db.notesFolder.findFirst({
        where: { id: folderId, user_id: user.id, deleted_at: null },
        select: { id: true },
      });
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    // Determine final title (may have been overridden via conflict resolution)
    let finalTitle = newTitle ?? importResult.title;

    // Check for title conflict if no pre-resolved conflict provided
    if (!conflictResolution) {
      const conflict = await checkTitleConflict({ userId: user.id, title: finalTitle });
      if (conflict.hasConflict) {
        return NextResponse.json({
          requiresConflictResolution: true,
          conflictingNoteId: conflict.conflictingNoteId,
          conflictingNoteTitle: conflict.conflictingNoteTitle,
          suggestedTitle: conflict.suggestedTitle,
          title: finalTitle,
        });
      }
    } else if (conflictResolution === "replace" && conflictingNoteId) {
      // Scope the soft-delete by user_id to prevent IDOR
      const updated = await db.note.updateMany({
        where: {
          id: conflictingNoteId,
          user_id: user.id,
          deleted_at: null,
        },
        data: { deleted_at: new Date() },
      });
      if (updated.count === 0) {
        return NextResponse.json({ error: "Conflicting note not found" }, { status: 404 });
      }
      await logActivity({
        user_id: user.id,
        entity_type: "Note",
        entity_id: conflictingNoteId,
        action: "import_conflict_resolved",
        meta: { resolution: "replace", new_title: finalTitle },
      });
    } else if (conflictResolution === "rename" && newTitle) {
      finalTitle = newTitle;
      if (conflictingNoteId) {
        await logActivity({
          user_id: user.id,
          entity_type: "Note",
          entity_id: conflictingNoteId,
          action: "import_conflict_resolved",
          meta: { resolution: "rename", new_title: finalTitle },
        });
      }
    } else if (conflictResolution === "skip") {
      return NextResponse.json({ skipped: true });
    }

    const wordCount = importResult.body_text.split(/\s+/).filter(Boolean).length;

    // Use pre-generated noteId for docx (images are already attached to it)
    const noteId = docxNoteId ?? newId();

    const note = await db.note.create({
      data: {
        id: noteId,
        user_id: user.id,
        title: finalTitle,
        folder_id: folderId ?? null,
        project_id: projectId ?? null,
        body_json: importResult.body_json,
        body_text: importResult.body_text,
        body_markdown: importResult.body_markdown,
        word_count: wordCount,
        imported_from: sourceFormat,
        imported_at: new Date(),
        source_metadata: importResult.source_metadata as Record<string, never>,
      },
    });

    // For docx: store original file as attachment on the note
    if (sourceFormat === "docx") {
      try {
        await uploadFile({
          userId: user.id,
          filename,
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          data: buffer,
          parentType: "Note",
          parentId: note.id,
        });
      } catch (err) {
        log.warn({ err, noteId: note.id }, "Failed to store original .docx as attachment — non-fatal");
      }
    }

    // Audit log
    await logActivity({
      user_id: user.id,
      entity_type: "Note",
      entity_id: note.id,
      action: sourceFormat === "docx" ? "note_imported_docx" : "note_imported_md",
      meta: {
        filename,
        title: note.title,
        detected_format: detectedFormat,
        warnings: importResult.warnings,
      },
    });

    return NextResponse.json({
      note: {
        id: note.id,
        title: note.title,
        created_at: note.created_at,
      },
      warnings: importResult.warnings,
      detectedFormat,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    log.error({ err, filename }, "Import failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

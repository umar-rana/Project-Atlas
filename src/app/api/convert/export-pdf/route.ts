import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { exportNoteToPdf } from "@/core/conversion/pdf-export";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import type { PdfExportOptions, PageSize } from "@/core/conversion/pdf-export";

const log = createLogger({ module: "api/convert/export-pdf" });

const exportRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkExportRateLimit(userId: string): boolean {
  const now = Date.now();
  const key = `export-pdf:${userId}`;
  const entry = exportRateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    exportRateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
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

  if (!checkExportRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 5 PDF exports per minute." },
      { status: 429 },
    );
  }

  let body: {
    noteId: string;
    pageSize?: string;
    embedImages?: boolean;
    includeAttachmentAppendix?: boolean;
    includeHeader?: boolean;
    includeFooter?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { noteId } = body;
  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  }

  const note = await db.note.findFirst({
    where: { id: noteId, user_id: user.id, deleted_at: null },
    select: { id: true, title: true, body_json: true },
  });

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  // Get attachment filenames for appendix
  const attachments = await db.attachment.findMany({
    where: { parent_type: "Note", parent_id: noteId, user_id: user.id, deleted_at: null },
    select: { filename: true },
  });

  const options: PdfExportOptions = {
    pageSize: (body.pageSize as PageSize) ?? "A4",
    embedImages: body.embedImages ?? true,
    includeAttachmentAppendix: body.includeAttachmentAppendix ?? false,
    includeHeader: body.includeHeader ?? true,
    includeFooter: body.includeFooter ?? true,
  };

  try {
    const result = await exportNoteToPdf({
      noteId: note.id,
      userId: user.id,
      title: note.title || "Untitled",
      bodyJson: note.body_json,
      options,
      attachmentFilenames: attachments.map((a) => a.filename),
    });

    await logActivity({
      user_id: user.id,
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

    return NextResponse.json({
      url: result.signedUrl,
      expiresAt: result.expiresAt.toISOString(),
      filename: `${slugify(note.title || "note")}.pdf`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF export failed";
    log.error({ err, noteId }, "PDF export failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "note";
}

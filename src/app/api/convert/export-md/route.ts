import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "api/convert/export-md" });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { noteId: string };
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
  });

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  // Build frontmatter
  const frontmatterLines: string[] = [
    "---",
    `title: ${JSON.stringify(note.title || "")}`,
    `purpose: ${note.purpose}`,
    `created_at: ${note.created_at.toISOString()}`,
    `updated_at: ${note.updated_at.toISOString()}`,
  ];

  if (note.imported_from) {
    frontmatterLines.push(`imported_from: ${note.imported_from}`);
  }

  frontmatterLines.push("---", "");

  // Get markdown body
  const markdownBody = note.body_markdown || tiptapToMarkdown(note.body_json);

  const fullContent = [...frontmatterLines, markdownBody].join("\n");

  const filename = `${slugify(note.title || "note")}.md`;

  await logActivity({
    user_id: user.id,
    entity_type: "Note",
    entity_id: note.id,
    action: "import_export_md",
    meta: { title: note.title, filename },
  });

  return new NextResponse(fullContent, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
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

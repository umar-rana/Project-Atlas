import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { storage } from "@/core/storage";
import { storagePath } from "@/core/storage/paths";
import { storeThumbnail } from "@/core/attachments/thumbnail";
import { validateFile } from "@/core/attachments/validators";
import { createLogger } from "@/core/logging";
import { logActivity } from "@/core/audit";

const log = createLogger({ module: "api/attachments/upload" });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const parentType = formData.get("parent_type") as string | null;
  const parentId = formData.get("parent_id") as string | null;
  const taskId = formData.get("task_id") as string | null;

  const validation = validateFile(file.name, file.type, file.size);
  if (validation.ok === false) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const fileId = newId();
  const path = storagePath(user.id, fileId, file.name);
  const data = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  try {
    await storage.upload({ path, data, contentType });
  } catch (err) {
    log.error({ err, path }, "Storage upload failed");
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  let thumbnailPath: string | null = null;
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;

  const thumbResult = await storeThumbnail({
    userId: user.id,
    fileId,
    filename: file.name,
    data,
    contentType,
  });
  if (thumbResult) {
    thumbnailPath = thumbResult.path;
    imageWidth = thumbResult.width;
    imageHeight = thumbResult.height;
  }

  const attachment = await db.attachment.create({
    data: {
      id: newId(),
      file_id: fileId,
      user_id: user.id,
      task_id: taskId ?? null,
      parent_type: parentType ?? (taskId ? "Task" : null),
      parent_id: parentId ?? taskId ?? null,
      filename: file.name,
      content_type: contentType,
      size_bytes: file.size,
      storage_path: path,
      thumbnail_path: thumbnailPath,
      image_width: imageWidth,
      image_height: imageHeight,
    },
  });

  await logActivity({
    user_id: user.id,
    entity_type: "Attachment",
    entity_id: attachment.id,
    action: "attachment_uploaded",
    meta: {
      filename: file.name,
      parent_type: parentType ?? (taskId ? "Task" : null),
      parent_id: parentId ?? taskId ?? null,
      task_id: taskId,
    },
  });

  if (taskId) {
    await logActivity({
      user_id: user.id,
      entity_type: "Task",
      entity_id: taskId,
      action: "attachment_uploaded",
      meta: { filename: file.name, attachment_id: attachment.id },
    });
  }

  log.info({ path, userId: user.id, taskId, attachmentId: attachment.id }, "File uploaded via API");

  return NextResponse.json({
    id: attachment.id,
    file_id: fileId,
    filename: file.name,
    content_type: contentType,
    size_bytes: file.size,
    storage_path: path,
    thumbnail_path: thumbnailPath,
    parent_type: attachment.parent_type,
    parent_id: attachment.parent_id,
    created_at: attachment.created_at,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { uploadFile } from "@/core/storage";
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

  const data = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const fileId = newId();

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

  let result: Awaited<ReturnType<typeof uploadFile>>;
  try {
    result = await uploadFile({
      userId: user.id,
      filename: file.name,
      contentType,
      data,
      taskId: taskId ?? undefined,
      parentType,
      parentId,
      thumbnailPath,
      imageWidth,
      imageHeight,
      fileId,
    });
  } catch (err) {
    log.error({ err }, "Storage upload failed");
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  await logActivity({
    user_id: user.id,
    entity_type: "Attachment",
    entity_id: result.attachmentId,
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
      meta: { filename: file.name, attachment_id: result.attachmentId },
    });
  }

  log.info({ path: result.path, userId: user.id, taskId, attachmentId: result.attachmentId }, "File uploaded via API");

  return NextResponse.json(result.attachment);
}

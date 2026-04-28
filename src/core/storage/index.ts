import { Client } from "@replit/object-storage";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "storage" });

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    _client = new Client();
  }
  return _client;
}

function storagePath(
  userId: string,
  fileId: string,
  filename: string,
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `users/${userId}/attachments/${year}/${month}/${fileId}-${filename}`;
}

export async function uploadFile(params: {
  userId: string;
  filename: string;
  contentType: string;
  data: Buffer | Uint8Array;
  taskId?: string;
}): Promise<{ fileId: string; path: string }> {
  const fileId = newId();
  const path = storagePath(params.userId, fileId, params.filename);
  const client = getClient();

  const data = Buffer.isBuffer(params.data) ? params.data : Buffer.from(params.data);
  const result = await client.uploadFromBytes(path, data);

  if (!result.ok) {
    const err = result.error;
    log.error({ err, path }, "Object storage upload failed");
    throw new Error(`Upload failed: ${err}`);
  }

  await db.attachment.create({
    data: {
      id: newId(),
      file_id: fileId,
      user_id: params.userId,
      task_id: params.taskId ?? null,
      filename: params.filename,
      content_type: params.contentType,
      size_bytes: params.data.byteLength,
      storage_path: path,
    },
  });

  log.info({ path, userId: params.userId, taskId: params.taskId }, "File uploaded");
  return { fileId, path };
}

export async function getFile(params: {
  userId: string;
  fileId: string;
}): Promise<{ data: Uint8Array; contentType: string; filename: string }> {
  const attachment = await db.attachment.findFirst({
    where: {
      file_id: params.fileId,
      user_id: params.userId,
      deleted_at: null,
    },
  });

  if (!attachment) {
    throw new Error("File not found or access denied");
  }

  const client = getClient();
  const result = await client.downloadAsBytes(attachment.storage_path);

  if (!result.ok) {
    throw new Error(`Download failed: ${result.error}`);
  }

  return {
    data: result.value[0] as Uint8Array,
    contentType: attachment.content_type,
    filename: attachment.filename,
  };
}

export async function deleteFile(params: {
  userId: string;
  fileId: string;
}): Promise<void> {
  const attachment = await db.attachment.findFirst({
    where: {
      file_id: params.fileId,
      user_id: params.userId,
      deleted_at: null,
    },
  });

  if (!attachment) {
    throw new Error("File not found or access denied");
  }

  await db.attachment.update({
    where: { id: attachment.id },
    data: { deleted_at: new Date() },
  });

  log.info({ fileId: params.fileId, userId: params.userId }, "File soft-deleted");
}

export async function checkStorageHealth(): Promise<boolean> {
  try {
    const testKey = `_health-check-${Date.now()}`;
    const client = getClient();
    const up = await client.uploadFromText(testKey, "ok");
    if (!up.ok) return false;
    const down = await client.downloadAsText(testKey);
    if (!down.ok) return false;
    const del = await client.delete(testKey);
    return del.ok;
  } catch {
    return false;
  }
}

import 'server-only';
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { storagePath } from "./paths";
import type { StorageProvider, StorageProviderName } from "./types";
import { R2Provider } from "./providers/r2";
import { ReplitProvider } from "./providers/replit";

export type { StorageProvider, StorageProviderName };
export { storagePath };

const log = createLogger({ module: "storage" });

function createProvider(): StorageProvider {
  const name = (process.env["STORAGE_PROVIDER"] ?? "r2") as StorageProviderName;
  switch (name) {
    case "r2":
      return new R2Provider();
    case "replit":
      return new ReplitProvider();
    default:
      log.warn({ name }, "Unknown STORAGE_PROVIDER — falling back to r2");
      return new R2Provider();
  }
}

let _provider: StorageProvider | null = null;

function getProvider(): StorageProvider {
  if (!_provider) {
    _provider = createProvider();
  }
  return _provider;
}

export const storage = {
  get providerName(): StorageProviderName {
    return getProvider().name;
  },
  upload: (params: { path: string; data: Buffer; contentType: string }) =>
    getProvider().upload(params),
  download: (path: string) => getProvider().download(path),
  getUrl: (params: { path: string; expiresInSeconds?: number }) =>
    getProvider().getUrl(params),
  delete: (path: string) => getProvider().delete(path),
  exists: (path: string) => getProvider().exists(path),
  list: (prefix: string) => getProvider().list(prefix),
};

export async function uploadFile(params: {
  userId: string;
  filename: string;
  contentType: string;
  data: Buffer | Uint8Array;
  taskId?: string;
}): Promise<{ fileId: string; path: string }> {
  const fileId = newId();
  const path = storagePath(params.userId, fileId, params.filename);

  const data = Buffer.isBuffer(params.data) ? params.data : Buffer.from(params.data);

  await storage.upload({ path, data, contentType: params.contentType });

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

  const data = await storage.download(attachment.storage_path);

  return {
    data: new Uint8Array(data),
    contentType: attachment.content_type,
    filename: attachment.filename,
  };
}

export async function getFileUrl(params: {
  userId: string;
  fileId: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; filename: string; contentType: string }> {
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

  const url = await storage.getUrl({
    path: attachment.storage_path,
    expiresInSeconds: params.expiresInSeconds ?? 3600,
  });

  return { url, filename: attachment.filename, contentType: attachment.content_type };
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

  try {
    await storage.delete(attachment.storage_path);
  } catch (err) {
    log.warn(
      { fileId: params.fileId, path: attachment.storage_path, err },
      "Storage delete failed — proceeding with DB soft-delete so attachment is no longer accessible",
    );
  }

  await db.attachment.update({
    where: { id: attachment.id },
    data: { deleted_at: new Date() },
  });

  log.info({ fileId: params.fileId, userId: params.userId }, "Attachment deleted");
}

export async function checkStorageHealth(): Promise<{ ok: boolean; provider: StorageProviderName }> {
  const provider = getProvider();
  try {
    const testKey = `_health-check-${Date.now()}`;
    const testData = Buffer.from("ok");
    await provider.upload({ path: testKey, data: testData, contentType: "text/plain" });
    const downloaded = await provider.download(testKey);
    if (downloaded.toString() !== "ok") return { ok: false, provider: provider.name };
    await provider.delete(testKey);
    return { ok: true, provider: provider.name };
  } catch {
    return { ok: false, provider: provider.name };
  }
}

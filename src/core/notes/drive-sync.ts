import "server-only";
import { getDriveClient } from "@/core/drive/client";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "notes/drive-sync" });

type FolderCache = Map<string, string>;

async function findOrCreateFolder(
  userId: string,
  name: string,
  parentId: string,
  driveId: string | undefined,
  cache: FolderCache,
): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const driveClient = await getDriveClient(userId);

  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const listRes = await driveClient.files.list({
    q,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    ...(driveId ? { driveId, corpora: "drive" } : {}),
  });

  const existing = listRes.data.files?.[0];
  if (existing?.id) {
    cache.set(cacheKey, existing.id);
    return existing.id;
  }

  const createRes = await driveClient.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name",
  });

  const newId = createRes.data.id;
  if (!newId) throw new Error(`Failed to create Drive folder "${name}"`);

  log.info({ userId, name, parentId, newId }, "Created Drive folder");
  cache.set(cacheKey, newId);
  return newId;
}

export async function ensureNotesPurposeFolder(
  userId: string,
  notesFolderId: string,
  purposeFolderName: string,
  sharedDriveId: string | undefined,
  cache: FolderCache,
): Promise<string> {
  return findOrCreateFolder(userId, purposeFolderName, notesFolderId, sharedDriveId, cache);
}

export function createFolderCache(): FolderCache {
  return new Map<string, string>();
}

export async function createNoteFile(
  userId: string,
  filename: string,
  content: string,
  parentFolderId: string,
): Promise<string> {
  const { Readable } = await import("stream");
  const driveClient = await getDriveClient(userId);
  const body = Buffer.from(content, "utf-8");
  const mimeType = "text/markdown";

  const res = await driveClient.files.create({
    supportsAllDrives: true,
    requestBody: { name: filename, mimeType, parents: [parentFolderId] },
    media: { mimeType, body: Readable.from(body) },
    fields: "id",
  });
  if (!res.data.id) throw new Error("Drive create returned no file ID");
  return res.data.id;
}

export async function updateNoteFile(
  userId: string,
  fileId: string,
  filename: string,
  content: string,
): Promise<string> {
  const { Readable } = await import("stream");
  const driveClient = await getDriveClient(userId);
  const body = Buffer.from(content, "utf-8");
  const mimeType = "text/markdown";

  const res = await driveClient.files.update({
    fileId,
    supportsAllDrives: true,
    requestBody: { name: filename },
    media: { mimeType, body: Readable.from(body) },
    fields: "id",
  });
  if (!res.data.id) throw new Error("Drive update returned no file ID");
  return res.data.id;
}

export async function deleteNoteFile(
  userId: string,
  fileId: string,
): Promise<void> {
  const driveClient = await getDriveClient(userId);
  await driveClient.files.delete({ fileId, supportsAllDrives: true });
}

export async function getNoteFileParentId(
  userId: string,
  fileId: string,
): Promise<string | null> {
  try {
    const driveClient = await getDriveClient(userId);
    const res = await driveClient.files.get({
      fileId,
      fields: "id,parents",
      supportsAllDrives: true,
    });
    const parents = res.data.parents;
    return parents?.[0] ?? null;
  } catch {
    return null;
  }
}

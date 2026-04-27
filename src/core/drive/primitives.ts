import { getDriveClient } from "./client";
import { enqueue } from "@/core/queue";
import { v4 as uuidv4 } from "uuid";
import type { drive_v3 } from "googleapis";

async function drive<T>(userId: string, fn: (d: drive_v3.Drive) => Promise<T>): Promise<T> {
  return enqueue({
    id: uuidv4(),
    priority: "USER",
    provider: "google_drive",
    userId,
    execute: async () => {
      const client = await getDriveClient(userId);
      return fn(client);
    },
  });
}

export async function listSharedDrives(userId: string) {
  return drive(userId, (d) =>
    d.drives.list({ pageSize: 50 }).then((r) => r.data.drives ?? []),
  );
}

export async function browseFolder(userId: string, folderId: string, driveId?: string) {
  return drive(userId, (d) =>
    d.files
      .list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id,name,mimeType,parents)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        driveId: driveId,
        corpora: driveId ? "drive" : "user",
      })
      .then((r) => r.data.files ?? []),
  );
}

export async function createFolder(
  userId: string,
  name: string,
  parentId: string,
  driveId?: string,
): Promise<drive_v3.Schema$File> {
  return drive(userId, (d) =>
    d.files
      .create({
        supportsAllDrives: true,
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
          driveId: driveId ?? undefined,
        },
        fields: "id,name",
      })
      .then((r) => r.data),
  );
}

export async function getFileMetadata(userId: string, fileId: string) {
  return drive(userId, (d) =>
    d.files
      .get({ fileId, fields: "id,name,mimeType,parents,size", supportsAllDrives: true })
      .then((r) => r.data),
  );
}

export async function listFiles(
  userId: string,
  folderId: string,
  query?: string,
) {
  return drive(userId, (d) =>
    d.files
      .list({
        q: `'${folderId}' in parents and trashed = false${query ? " and " + query : ""}`,
        fields: "files(id,name,mimeType,size,modifiedTime)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
      .then((r) => r.data.files ?? []),
  );
}

export async function uploadFile(
  userId: string,
  name: string,
  mimeType: string,
  body: Buffer,
  parentId: string,
) {
  const { Readable } = await import("stream");
  return drive(userId, (d) =>
    d.files
      .create({
        supportsAllDrives: true,
        requestBody: { name, mimeType, parents: [parentId] },
        media: { mimeType, body: Readable.from(body) },
        fields: "id,name",
      })
      .then((r) => r.data),
  );
}

export async function downloadFile(userId: string, fileId: string): Promise<Buffer> {
  return drive(userId, async (d) => {
    const response = await d.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(response.data as ArrayBuffer);
  });
}

export async function updateFile(
  userId: string,
  fileId: string,
  name?: string,
  body?: Buffer,
  mimeType?: string,
) {
  const { Readable } = await import("stream");
  return drive(userId, (d) =>
    d.files
      .update({
        fileId,
        supportsAllDrives: true,
        requestBody: name ? { name } : {},
        media: body && mimeType ? { mimeType, body: Readable.from(body) } : undefined,
        fields: "id,name",
      })
      .then((r) => r.data),
  );
}

export async function deleteFile(userId: string, fileId: string) {
  return drive(userId, (d) =>
    d.files.delete({ fileId, supportsAllDrives: true }).then(() => undefined),
  );
}

export async function moveFile(
  userId: string,
  fileId: string,
  newParentId: string,
  oldParentId: string,
) {
  return drive(userId, (d) =>
    d.files
      .update({
        fileId,
        addParents: newParentId,
        removeParents: oldParentId,
        supportsAllDrives: true,
        fields: "id,parents",
      })
      .then((r) => r.data),
  );
}

export async function getChanges(userId: string, pageToken: string) {
  return drive(userId, (d) =>
    d.changes
      .list({
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: "changes(fileId,removed,file(id,name,mimeType)),nextPageToken,newStartPageToken",
      })
      .then((r) => r.data),
  );
}

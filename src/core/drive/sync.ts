/**
 * Drive Sync — outbound push from object storage (ProjectAtlas) to Google Drive.
 *
 * Architecture:
 *   Object Storage (R2/ProjectAtlas) ──► Google Drive (user's linked account)
 *
 * Drive is NEVER the source of truth. All primary data lives in object storage.
 * These helpers are called by sync jobs to push a copy of content to the user's Drive
 * as a secondary, human-readable backup destination.
 *
 * Reading back from Drive into Atlas is explicitly out of scope.
 */

import { storage } from "@/core/storage";
import { db } from "@/core/db";
import { uploadFile as driveUpload } from "./primitives";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "drive/sync" });

/**
 * Push a file that lives in object storage out to Google Drive.
 *
 * Flow:
 *   1. Fetch the file from object storage (ProjectAtlas bucket).
 *   2. Upload the bytes to the user's linked Drive folder.
 *
 * @param userId       - Atlas user ID (used to retrieve Drive credentials).
 * @param storagePath  - Path of the file inside the ProjectAtlas bucket.
 * @param driveParentId - ID of the Drive folder to push the file into.
 * @param filename     - Filename to use in Drive.
 * @param mimeType     - MIME type of the file.
 * @returns            - The Drive file ID of the newly created file.
 */
export async function pushStorageFileToDrive(params: {
  userId: string;
  storagePath: string;
  driveParentId: string;
  filename: string;
  mimeType: string;
}): Promise<{ driveFileId: string }> {
  log.info(
    {
      userId: params.userId,
      storagePath: params.storagePath,
      driveParentId: params.driveParentId,
      provider: storage.providerName,
    },
    "Fetching file from object storage for Drive push",
  );

  const data = await storage.download(params.storagePath);

  log.info(
    { userId: params.userId, filename: params.filename, bytes: data.byteLength },
    "Pushing file from object storage to Google Drive",
  );

  const driveFile = await driveUpload(
    params.userId,
    params.filename,
    params.mimeType,
    data,
    params.driveParentId,
  );

  if (!driveFile.id) {
    throw new Error("Drive upload succeeded but returned no file ID");
  }

  log.info(
    { userId: params.userId, driveFileId: driveFile.id, storagePath: params.storagePath },
    "File pushed from object storage to Google Drive",
  );

  return { driveFileId: driveFile.id };
}

/**
 * Push a raw buffer directly to Google Drive (e.g. for database exports that are
 * assembled in-memory rather than read from object storage).
 *
 * This is still a one-way push — Drive receives a copy; the canonical data stays in Atlas.
 */
export async function pushBufferToDrive(params: {
  userId: string;
  driveParentId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}): Promise<{ driveFileId: string }> {
  log.info(
    { userId: params.userId, filename: params.filename, driveParentId: params.driveParentId },
    "Pushing buffer to Google Drive",
  );

  const driveFile = await driveUpload(
    params.userId,
    params.filename,
    params.mimeType,
    params.data,
    params.driveParentId,
  );

  if (!driveFile.id) {
    throw new Error("Drive upload succeeded but returned no file ID");
  }

  log.info({ userId: params.userId, driveFileId: driveFile.id }, "Buffer pushed to Google Drive");

  return { driveFileId: driveFile.id };
}

export type DriveContentType = "notes" | "journal" | "attachments" | "database-backups";

/**
 * Resolve which Drive subfolder ID to push content into based on content type.
 *
 * Maps content type to the persisted subfolder ID in DriveConfig:
 *   "database-backups" → folder_database_backups
 *   "notes"            → folder_notes
 *   "journal"          → folder_journal
 *   "attachments"      → folder_attachments
 *
 * Falls back to atlas_folder_id if the specific subfolder ID was not persisted
 * (e.g. accounts linked before subfolders were tracked).
 *
 * Throws if Drive is not linked at all for this user.
 */
export async function resolveDriveFolder(
  userId: string,
  contentType: DriveContentType,
): Promise<string> {
  const config = await db.driveConfig.findUnique({ where: { user_id: userId } });

  if (!config) {
    throw new Error("Drive is not linked for this user");
  }

  const folderMap: Record<DriveContentType, string | null> = {
    "database-backups": config.folder_database_backups,
    notes: config.folder_notes,
    journal: config.folder_journal,
    attachments: config.folder_attachments,
  };

  const folderId = folderMap[contentType];

  if (folderId) {
    return folderId;
  }

  if (config.atlas_folder_id) {
    log.warn(
      { userId, contentType },
      "Specific Drive subfolder ID not found — falling back to atlas_folder_id. Re-link Drive to populate subfolder IDs.",
    );
    return config.atlas_folder_id;
  }

  throw new Error(
    `No Drive folder ID found for content type "${contentType}" and no Atlas folder fallback is available. Re-link Google Drive to initialize the folder structure.`,
  );
}

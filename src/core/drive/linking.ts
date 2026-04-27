import { db, newId } from "@/core/db";
import { createFolder } from "./primitives";
import { hasDriveToken } from "./client";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "drive/linking" });

interface FolderNode {
  name: string;
  children?: FolderNode[];
}

export const ATLAS_FOLDER_TREE: FolderNode[] = [
  { name: "database-backups" },
  {
    name: "notes",
    children: [
      {
        name: "journal",
        children: [{ name: "attachments" }],
      },
    ],
  },
  { name: "project-briefs" },
  { name: "meeting-notes" },
  { name: "research" },
  { name: "strategy-docs" },
  { name: "general" },
];

async function createFolderTree(
  userId: string,
  nodes: FolderNode[],
  parentId: string,
  driveId?: string,
): Promise<void> {
  for (const node of nodes) {
    const folder = await createFolder(userId, node.name, parentId, driveId);
    if (folder.id && node.children?.length) {
      await createFolderTree(userId, node.children, folder.id, driveId);
    }
  }
}

export async function linkDrive(params: {
  userId: string;
  driveType: "personal" | "shared";
  rootFolderId: string;
  rootFolderName: string;
  sharedDriveId?: string;
}): Promise<void> {
  const atlasFolder = await createFolder(
    params.userId,
    "Atlas",
    params.rootFolderId,
    params.sharedDriveId,
  );

  if (!atlasFolder.id) {
    throw new Error("Failed to create Atlas folder in Drive");
  }

  await createFolderTree(params.userId, ATLAS_FOLDER_TREE, atlasFolder.id, params.sharedDriveId);

  await db.driveConfig.upsert({
    where: { user_id: params.userId },
    create: {
      id: newId(),
      user_id: params.userId,
      drive_type: params.driveType,
      shared_drive_id: params.sharedDriveId ?? null,
      root_folder_id: params.rootFolderId,
      root_folder_name: params.rootFolderName,
      atlas_folder_id: atlasFolder.id,
      verified: true,
    },
    update: {
      drive_type: params.driveType,
      shared_drive_id: params.sharedDriveId ?? null,
      root_folder_id: params.rootFolderId,
      root_folder_name: params.rootFolderName,
      atlas_folder_id: atlasFolder.id,
      verified: true,
    },
  });

  log.info({ userId: params.userId, atlasFolder: atlasFolder.id }, "Drive linked");
}

export async function unlinkDrive(userId: string): Promise<void> {
  await db.driveConfig.deleteMany({ where: { user_id: userId } });
  await db.integrationToken.deleteMany({
    where: { user_id: userId, provider: "google_drive" },
  });
  log.info({ userId }, "Drive unlinked");
}

export async function verifyDriveConfig(userId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const config = await db.driveConfig.findUnique({ where: { user_id: userId } });
  if (!config) return { ok: false, reason: "No Drive config found" };

  const hasToken = await hasDriveToken(userId);
  if (!hasToken) return { ok: false, reason: "No Drive token found" };

  return { ok: true };
}

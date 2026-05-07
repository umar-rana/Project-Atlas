import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { linkDrive, unlinkDrive, verifyDriveConfig } from "@/core/drive/linking";
import { listSharedDrives, browseFolder, createFolder } from "@/core/drive/primitives";
import { z } from "zod";

const DRIVE_RESOURCE_TYPES = ["notes", "tables", "attachments"] as const;
type DriveResourceType = (typeof DRIVE_RESOURCE_TYPES)[number];

export const driveRouter = router({
  linkStatus: protectedProcedure.query(async ({ ctx }) => {
    const [config, tokenExists] = await Promise.all([
      db.driveConfig.findUnique({ where: { user_id: ctx.user.id } }),
      db.integrationToken.findUnique({
        where: { user_id_provider: { user_id: ctx.user.id, provider: "google_drive" } },
        select: { id: true },
      }),
    ]);
    return { linked: !!config, config: config ?? null, hasToken: !!tokenExists };
  }),

  startLinkFlow: protectedProcedure.mutation(async () => {
    return { authUrl: "/api/drive/connect" };
  }),

  listSharedDrives: protectedProcedure.query(async ({ ctx }) => {
    const drives = await listSharedDrives(ctx.user.id);
    return drives;
  }),

  browseFolder: protectedProcedure
    .input(z.object({ folderId: z.string(), driveId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const files = await browseFolder(ctx.user.id, input.folderId, input.driveId);
      return files;
    }),

  completeLinkFlow: protectedProcedure
    .input(
      z.object({
        driveType: z.enum(["personal", "shared"]),
        rootFolderId: z.string(),
        rootFolderName: z.string(),
        sharedDriveId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await linkDrive({
        userId: ctx.user.id,
        driveType: input.driveType,
        rootFolderId: input.rootFolderId,
        rootFolderName: input.rootFolderName,
        sharedDriveId: input.sharedDriveId,
      });
      return { ok: true };
    }),

  unlink: protectedProcedure.mutation(async ({ ctx }) => {
    await unlinkDrive(ctx.user.id);
    return { ok: true };
  }),

  createFolder: protectedProcedure
    .input(
      z.object({
        parentId: z.string(),
        name: z.string().min(1).max(255),
        driveId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const folder = await createFolder(ctx.user.id, input.name, input.parentId, input.driveId);
      return { id: folder.id ?? null, name: folder.name ?? input.name };
    }),

  verify: protectedProcedure.query(async ({ ctx }) => {
    return verifyDriveConfig(ctx.user.id);
  }),

  syncStatus: protectedProcedure.query(async ({ ctx }) => {
    const states = await db.syncState.findMany({
      where: {
        user_id: ctx.user.id,
        provider: "google_drive",
        resource_type: { in: [...DRIVE_RESOURCE_TYPES] },
      },
      select: { resource_type: true, last_synced: true },
    });

    const byType = Object.fromEntries(
      states.map((s) => [s.resource_type as DriveResourceType, s.last_synced]),
    ) as Partial<Record<DriveResourceType, Date | null>>;

    const allTimestamps = states.map((s) => s.last_synced).filter((d): d is Date => d !== null);

    const lastSynced =
      allTimestamps.length > 0
        ? new Date(Math.max(...allTimestamps.map((d) => d.getTime())))
        : null;

    return { byType, lastSynced };
  }),
});

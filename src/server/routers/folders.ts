import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure, userOwned, userOwnedActive } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";

export type FolderNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  notes: string | null;
  position: Prisma.Decimal;
  collapsed: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  children: FolderNode[];
  project_count: number;
};

function buildTree(
  folders: Omit<FolderNode, "children">[],
  projectCounts: Map<string, number>,
  parentId: string | null = null,
): FolderNode[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .sort((a, b) => {
      const pa = new Prisma.Decimal(a.position);
      const pb = new Prisma.Decimal(b.position);
      return pa.comparedTo(pb);
    })
    .map((f) => ({
      ...f,
      project_count: projectCounts.get(f.id) ?? 0,
      children: buildTree(folders, projectCounts, f.id),
    }));
}

function getDepth(folders: { id: string; parent_id: string | null }[], folderId: string): number {
  let depth = 0;
  let current = folderId;
  const parentMap = new Map(folders.map((f) => [f.id, f.parent_id]));
  while (true) {
    const parentId = parentMap.get(current);
    if (!parentId) break;
    depth++;
    current = parentId;
    if (depth > 6) break;
  }
  return depth;
}

function getSubtreeHeight(
  folders: { id: string; parent_id: string | null }[],
  folderId: string,
): number {
  // Returns the number of extra levels below folderId (0 = leaf, 1 = one child level, etc.)
  let maxHeight = 0;
  const queue: { id: string; depth: number }[] = [{ id: folderId, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    for (const f of folders) {
      if (f.parent_id === id) {
        const childDepth = depth + 1;
        if (childDepth > maxHeight) maxHeight = childDepth;
        queue.push({ id: f.id, depth: childDepth });
      }
    }
  }
  return maxHeight;
}

function getDescendantIds(
  folders: { id: string; parent_id: string | null }[],
  folderId: string,
): Set<string> {
  const descendants = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const f of folders) {
      if (f.parent_id === current && !descendants.has(f.id)) {
        descendants.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return descendants;
}

export const foldersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const folders = await db.projectFolder.findMany({
      where: userOwnedActive(ctx.user),
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    const projectCounts = await db.project.groupBy({
      by: ["folder_id"],
      where: userOwnedActive(ctx.user, {
        folder_id: { in: folders.map((f) => f.id) },
      }),
      _count: { _all: true },
    });
    const countMap = new Map(
      projectCounts
        .filter((c) => c.folder_id != null)
        .map((c) => [c.folder_id as string, c._count._all]),
    );

    const flat = folders.map((f) => ({ ...f, project_count: countMap.get(f.id) ?? 0 }));
    return buildTree(flat, countMap);
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const folder = await db.projectFolder.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
        include: {
          children: {
            where: { deleted_at: null },
            orderBy: [{ position: "asc" }, { name: "asc" }],
          },
          projects: {
            where: { deleted_at: null },
            orderBy: [{ position: "asc" }],
          },
        },
      });
      if (!folder) throw new TRPCError({ code: "NOT_FOUND" });

      const projectIds = folder.projects.map((p) => p.id);

      // Also gather all projects inside child subfolders for richer context
      const childFolderIds = folder.children.map((c) => c.id);
      const childProjects =
        childFolderIds.length > 0
          ? await db.project.findMany({
              where: { folder_id: { in: childFolderIds }, deleted_at: null },
              select: { id: true, folder_id: true },
            })
          : [];
      const allProjectIds = [...projectIds, ...childProjects.map((p) => p.id)];

      const taskCounts =
        allProjectIds.length > 0
          ? await db.task.groupBy({
              by: ["project_id"],
              where: {
                project_id: { in: allProjectIds },
                status: "active",
                deleted_at: null,
              },
              _count: { _all: true },
            })
          : [];
      const taskMap = new Map(
        taskCounts
          .filter((c) => c.project_id != null)
          .map((c) => [c.project_id as string, c._count._all]),
      );

      // Compute total task count per child subfolder
      const childTaskCounts = new Map<string, number>();
      for (const cp of childProjects) {
        if (!cp.folder_id) continue;
        const existing = childTaskCounts.get(cp.folder_id) ?? 0;
        childTaskCounts.set(cp.folder_id, existing + (taskMap.get(cp.id) ?? 0));
      }

      return {
        ...folder,
        projects: folder.projects.map((p) => ({
          ...p,
          task_count: taskMap.get(p.id) ?? 0,
        })),
        children: folder.children.map((c) => ({
          ...c,
          task_count: childTaskCounts.get(c.id) ?? 0,
        })),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        notes: z.string().max(10_000).optional(),
        parent_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      if (input.parent_id) {
        const allFolders = await db.projectFolder.findMany({
          where: { user_id: userId, deleted_at: null },
          select: { id: true, parent_id: true },
        });
        const parentExists = allFolders.some((f) => f.id === input.parent_id);
        if (!parentExists) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Parent folder not found" });
        }
        const depth = getDepth(allFolders, input.parent_id);
        if (depth >= 4) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Maximum folder depth of 5 levels reached",
          });
        }
      }

      const max = await db.projectFolder.aggregate({
        _max: { position: true },
        where: { user_id: userId, parent_id: input.parent_id ?? null },
      });
      const position = (
        max._max.position
          ? new Prisma.Decimal(max._max.position).plus(1024)
          : new Prisma.Decimal(1024)
      ).toString();

      const folder = await db.projectFolder.create({
        data: {
          id: newId(),
          user_id: userId,
          name: input.name,
          notes: input.notes ?? null,
          parent_id: input.parent_id ?? null,
          position: new Prisma.Decimal(position),
        },
      });

      await logActivity({
        user_id: userId,
        entity_type: "ProjectFolder",
        entity_id: folder.id,
        action: "folder_created",
        meta: { name: folder.name },
      });

      return folder;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(10_000).nullable().optional(),
        collapsed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const folder = await db.projectFolder.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!folder) throw new TRPCError({ code: "NOT_FOUND" });

      const data: Prisma.ProjectFolderUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.collapsed !== undefined) data.collapsed = input.collapsed;

      const updated = await db.projectFolder.update({
        where: { id: input.id },
        data,
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "ProjectFolder",
        entity_id: updated.id,
        action: "folder_updated",
        meta: { name: updated.name },
      });

      return updated;
    }),

  toggleCollapsed: protectedProcedure
    .input(z.object({ id: z.string().uuid(), collapsed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const folder = await db.projectFolder.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!folder) throw new TRPCError({ code: "NOT_FOUND" });

      await db.projectFolder.update({
        where: { id: input.id },
        data: { collapsed: input.collapsed },
      });

      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const folder = await db.projectFolder.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!folder) throw new TRPCError({ code: "NOT_FOUND" });

      await db.$transaction(async (tx) => {
        // Move projects in this folder to root (null folder)
        await tx.project.updateMany({
          where: userOwned(ctx.user, { folder_id: input.id }),
          data: { folder_id: null },
        });
        // Move child folders to root
        await tx.projectFolder.updateMany({
          where: userOwned(ctx.user, { parent_id: input.id }),
          data: { parent_id: null },
        });
        // Soft-delete the folder
        await tx.projectFolder.update({
          where: { id: input.id },
          data: { deleted_at: new Date() },
        });
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "ProjectFolder",
        entity_id: input.id,
        action: "folder_deleted",
        meta: { name: folder.name },
      });

      return { ok: true };
    }),

  move: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        parent_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const folder = await db.projectFolder.findFirst({
        where: { id: input.id, user_id: userId, deleted_at: null },
      });
      if (!folder) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.parent_id) {
        if (input.parent_id === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot move folder into itself" });
        }
        const allFolders = await db.projectFolder.findMany({
          where: { user_id: userId, deleted_at: null },
          select: { id: true, parent_id: true },
        });
        const parentExists = allFolders.some((f) => f.id === input.parent_id);
        if (!parentExists) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Target folder not found" });
        }
        // Prevent cycles: target must not be a descendant of the folder being moved
        const descendants = getDescendantIds(allFolders, input.id);
        if (descendants.has(input.parent_id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot move folder into one of its own descendants",
          });
        }
        const parentDepth = getDepth(allFolders, input.parent_id);
        const subtreeHeight = getSubtreeHeight(allFolders, input.id);
        // After move: moved folder at parentDepth+1, its deepest child at parentDepth+1+subtreeHeight
        // Max allowed depth is 4 (5 levels: 0-4)
        if (parentDepth + 1 + subtreeHeight > 4) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Maximum folder depth of 5 levels reached",
          });
        }
      }

      await db.projectFolder.update({
        where: { id: input.id },
        data: { parent_id: input.parent_id },
      });

      return { ok: true };
    }),

  moveProject: protectedProcedure
    .input(
      z.object({
        project_id: z.string().uuid(),
        folder_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const project = await db.project.findFirst({
        where: { id: input.project_id, user_id: userId, deleted_at: null },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.folder_id) {
        const folder = await db.projectFolder.findFirst({
          where: { id: input.folder_id, user_id: userId, deleted_at: null },
        });
        if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      }

      await db.project.update({
        where: { id: input.project_id },
        data: { folder_id: input.folder_id },
      });

      await logActivity({
        user_id: userId,
        entity_type: "Project",
        entity_id: input.project_id,
        action: "project_moved",
        meta: { folder_id: input.folder_id },
      });

      return { ok: true };
    }),
});

import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";

const MAX_DEPTH = 5;

export type TablesFolderNode = {
  id: string;
  name: string;
  parent_id: string | null;
  position: Prisma.Decimal | string;
  table_count: number;
  children: TablesFolderNode[];
};

function buildTree(
  folders: { id: string; name: string; parent_id: string | null; position: Prisma.Decimal }[],
  tableCounts: Map<string, number>,
  parentId: string | null = null,
): TablesFolderNode[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .sort((a, b) => new Prisma.Decimal(a.position).comparedTo(new Prisma.Decimal(b.position)))
    .map((f) => ({
      ...f,
      table_count: tableCounts.get(f.id) ?? 0,
      children: buildTree(folders, tableCounts, f.id),
    }));
}

function getDepth(
  folders: { id: string; parent_id: string | null }[],
  folderId: string,
): number {
  let depth = 0;
  let current = folderId;
  const parentMap = new Map(folders.map((f) => [f.id, f.parent_id]));
  while (true) {
    const parentId = parentMap.get(current);
    if (!parentId) break;
    depth++;
    current = parentId;
    if (depth > MAX_DEPTH + 1) break;
  }
  return depth;
}

function getDescendantIds(
  folders: { id: string; parent_id: string | null }[],
  folderId: string,
): string[] {
  const ids: string[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = folders.filter((f) => f.parent_id === current);
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

export const tablesFoldersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const folders = await db.tablesFolder.findMany({
      where: { user_id: ctx.user.id, deleted_at: null },
      select: { id: true, name: true, parent_id: true, position: true },
    });

    const tableCounts = await db.table.groupBy({
      by: ["folder_id"],
      where: { user_id: ctx.user.id, deleted_at: null, folder_id: { not: null } },
      _count: { id: true },
    });
    const countMap = new Map(
      tableCounts
        .filter((r) => r.folder_id != null)
        .map((r) => [r.folder_id as string, r._count.id]),
    );

    return buildTree(folders, countMap);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        parent_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const allFolders = await db.tablesFolder.findMany({
        where: { user_id: ctx.user.id, deleted_at: null },
        select: { id: true, parent_id: true },
      });

      if (input.parent_id) {
        const parentExists = allFolders.find((f) => f.id === input.parent_id);
        if (!parentExists) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parent folder not found" });
        }
        const parentDepth = getDepth(allFolders, input.parent_id);
        if (parentDepth >= MAX_DEPTH - 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Folders can only be nested up to ${MAX_DEPTH} levels deep.`,
          });
        }
      }

      const siblings = await db.tablesFolder.findMany({
        where: {
          user_id: ctx.user.id,
          parent_id: input.parent_id ?? null,
          deleted_at: null,
        },
        select: { position: true },
        orderBy: { position: "desc" },
        take: 1,
      });
      const nextPosition = siblings[0]
        ? new Prisma.Decimal(siblings[0].position).plus(1)
        : new Prisma.Decimal(0);

      const folder = await db.tablesFolder.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          name: input.name,
          parent_id: input.parent_id ?? null,
          position: nextPosition,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "TablesFolder",
        entity_id: folder.id,
        action: "tables_folder_created",
        meta: { name: folder.name, parent_id: folder.parent_id },
      });

      return folder;
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.tablesFolder.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, name: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.tablesFolder.update({
        where: { id: input.id },
        data: { name: input.name },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "TablesFolder",
        entity_id: input.id,
        action: "tables_folder_renamed",
        before: { name: existing.name },
        after: { name: input.name },
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
      const allFolders = await db.tablesFolder.findMany({
        where: { user_id: ctx.user.id, deleted_at: null },
        select: { id: true, parent_id: true },
      });

      const existing = allFolders.find((f) => f.id === input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.parent_id) {
        if (input.parent_id === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot move a folder into itself." });
        }
        const descendants = getDescendantIds(allFolders, input.id);
        if (descendants.includes(input.parent_id)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot move a folder into one of its descendants." });
        }
        const parentDepth = getDepth(allFolders, input.parent_id);
        if (parentDepth >= MAX_DEPTH - 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Moving this folder here would exceed the ${MAX_DEPTH}-level depth limit.`,
          });
        }
      }

      const newSiblings = await db.tablesFolder.findMany({
        where: {
          user_id: ctx.user.id,
          parent_id: input.parent_id ?? null,
          id: { not: input.id },
          deleted_at: null,
        },
        select: { position: true },
        orderBy: { position: "desc" },
        take: 1,
      });
      const newPosition = newSiblings[0]
        ? new Prisma.Decimal(newSiblings[0].position).plus(1)
        : new Prisma.Decimal(0);

      await db.tablesFolder.update({
        where: { id: input.id },
        data: { parent_id: input.parent_id, position: newPosition },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "TablesFolder",
        entity_id: input.id,
        action: "tables_folder_moved",
        meta: { parent_id: input.parent_id },
      });

      return { ok: true };
    }),

  reorder: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        parent_id: z.string().uuid().nullable(),
        insert_after_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const allFolders = await db.tablesFolder.findMany({
        where: { user_id: ctx.user.id, deleted_at: null },
        select: { id: true, parent_id: true, position: true, name: true },
      });

      const folder = allFolders.find((f) => f.id === input.id);
      if (!folder) throw new TRPCError({ code: "NOT_FOUND" });

      const siblings = allFolders
        .filter((f) => f.parent_id === input.parent_id && f.id !== input.id)
        .sort((a, b) => new Prisma.Decimal(a.position).comparedTo(new Prisma.Decimal(b.position)));

      let insertIdx: number;
      if (input.insert_after_id === null) {
        insertIdx = 0;
      } else {
        const afterIdx = siblings.findIndex((f) => f.id === input.insert_after_id);
        insertIdx = afterIdx >= 0 ? afterIdx + 1 : siblings.length;
      }

      const ordered = [...siblings];
      ordered.splice(insertIdx, 0, folder as typeof siblings[0]);

      const STEP = 100;
      const updates = ordered.map((f, i) => ({
        id: f.id,
        position: new Prisma.Decimal(i * STEP),
      }));

      await db.$transaction(
        updates.map((u) =>
          db.tablesFolder.update({
            where: { id: u.id },
            data: { parent_id: input.parent_id, position: u.position },
          }),
        ),
      );

      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const allFolders = await db.tablesFolder.findMany({
        where: { user_id: ctx.user.id, deleted_at: null },
        select: { id: true, name: true, parent_id: true },
      });

      const existing = allFolders.find((f) => f.id === input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const descendantIds = getDescendantIds(allFolders, input.id);
      const allIds = [input.id, ...descendantIds];

      const now = new Date();
      await db.tablesFolder.updateMany({
        where: { id: { in: allIds }, user_id: ctx.user.id },
        data: { deleted_at: now },
      });

      await db.table.updateMany({
        where: { folder_id: { in: allIds }, user_id: ctx.user.id, deleted_at: null },
        data: { deleted_at: now },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "TablesFolder",
        entity_id: input.id,
        action: "tables_folder_deleted",
        meta: { name: existing.name, cascade_count: allIds.length - 1 },
      });

      return { ok: true };
    }),
});

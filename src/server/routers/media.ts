import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { z } from "zod";
import { classifyContentType } from "@/core/attachments/validators";
import type { Prisma } from "@prisma/client";

type FileTypeCategory = "image" | "pdf" | "video" | "audio" | "doc" | "other";

/**
 * Returns a Prisma `content_type` filter clause for a given category.
 * Mirrors the runtime logic in `classifyContentType` so counts are accurate.
 */
function fileTypeToPrismaFilter(fileType: FileTypeCategory): Prisma.AttachmentWhereInput {
  switch (fileType) {
    case "image":
      return { content_type: { startsWith: "image/" } };
    case "pdf":
      return { content_type: "application/pdf" };
    case "video":
      return { content_type: { startsWith: "video/" } };
    case "audio":
      return { content_type: { startsWith: "audio/" } };
    case "doc":
      return {
        OR: [
          { content_type: { contains: "word" } },
          { content_type: { contains: "spreadsheet" } },
          { content_type: { contains: "presentation" } },
          { content_type: "text/plain" },
          { content_type: "text/markdown" },
          { content_type: "text/csv" },
        ],
      };
    case "other":
      return {
        NOT: {
          OR: [
            { content_type: { startsWith: "image/" } },
            { content_type: "application/pdf" },
            { content_type: { startsWith: "video/" } },
            { content_type: { startsWith: "audio/" } },
            { content_type: { contains: "word" } },
            { content_type: { contains: "spreadsheet" } },
            { content_type: { contains: "presentation" } },
            { content_type: "text/plain" },
            { content_type: "text/markdown" },
            { content_type: "text/csv" },
          ],
        },
      };
  }
}

const attachmentSelect = {
  id: true,
  file_id: true,
  filename: true,
  content_type: true,
  size_bytes: true,
  storage_path: true,
  thumbnail_path: true,
  description: true,
  reviewed: true,
  position: true,
  image_width: true,
  image_height: true,
  task_id: true,
  parent_type: true,
  parent_id: true,
  created_at: true,
  updated_at: true,
  tags: {
    select: {
      tag: { select: { id: true, name: true, color: true } },
    },
  },
} as const;

export const mediaRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(100).default(48),
        file_type: z.enum(["image", "pdf", "video", "audio", "doc", "other"]).optional(),
        source: z.enum(["tasks", "orphaned"]).optional(),
        reviewed: z.boolean().optional(),
        tag_id: z.string().uuid().optional(),
        search: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        sort: z
          .enum(["newest", "oldest", "largest", "smallest", "name_asc", "name_desc"])
          .default("newest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.AttachmentWhereInput = {
        user_id: ctx.user.id,
        deleted_at: null,
      };

      if (input.source === "orphaned") {
        where.parent_type = null;
      } else if (input.source === "tasks") {
        where.parent_type = { not: null };
      }

      if (input.reviewed !== undefined) {
        where.reviewed = input.reviewed;
      }

      if (input.tag_id) {
        where.tags = { some: { tag_id: input.tag_id } };
      }

      if (input.search) {
        where.OR = [
          { filename: { contains: input.search } },
          { description: { contains: input.search } },
        ];
      }

      if (input.date_from || input.date_to) {
        where.created_at = {};
        if (input.date_from) where.created_at.gte = new Date(input.date_from);
        if (input.date_to) where.created_at.lte = new Date(input.date_to);
      }

      type OrderByClause =
        | { created_at: "asc" | "desc" }
        | { size_bytes: "asc" | "desc" }
        | { filename: "asc" | "desc" };

      const orderBy: OrderByClause =
        input.sort === "oldest"
          ? { created_at: "asc" }
          : input.sort === "largest"
            ? { size_bytes: "desc" }
            : input.sort === "smallest"
              ? { size_bytes: "asc" }
              : input.sort === "name_asc"
                ? { filename: "asc" }
                : input.sort === "name_desc"
                  ? { filename: "desc" }
                  : { created_at: "desc" };

      // Push file_type filter into the DB where clause so the count() is accurate
      // and we avoid fetching rows only to discard them in JS.
      if (input.file_type) {
        const typeFilter = fileTypeToPrismaFilter(input.file_type);
        where.AND = [typeFilter];
      }

      const skip = (input.page - 1) * input.per_page;

      const [rawItems, total] = await Promise.all([
        db.attachment.findMany({
          where,
          orderBy,
          skip,
          take: input.per_page,
          select: {
            ...attachmentSelect,
            task_id: true,
          },
        }),
        db.attachment.count({ where }),
      ]);

      const items = rawItems;

      const taskIds = items.filter((a) => a.task_id).map((a) => a.task_id as string);

      const tasks =
        taskIds.length > 0
          ? await db.task.findMany({
              where: { id: { in: taskIds } },
              select: { id: true, title: true, deleted_at: true },
            })
          : [];
      const taskMap = new Map(tasks.map((t) => [t.id, t]));

      const enriched = items.map((a) => {
        const task = a.task_id ? taskMap.get(a.task_id) : null;
        let source_label: string;
        if (!a.parent_type || !a.parent_id) {
          if (task) {
            source_label = `Previously attached to deleted task: ${task.title}`;
          } else {
            source_label = "Orphaned";
          }
        } else if (a.parent_type === "Task" && task) {
          if (task.deleted_at) {
            source_label = `Previously attached to deleted task: ${task.title}`;
          } else {
            source_label = `Task: ${task.title}`;
          }
        } else {
          source_label = "Orphaned";
        }

        const is_orphan = !a.parent_type || (a.parent_type === "Task" && task?.deleted_at != null);

        return {
          ...a,
          source_label,
          is_orphan,
          task,
          file_type: classifyContentType(a.content_type),
        };
      });

      return {
        items: enriched,
        total,
        page: input.page,
        per_page: input.per_page,
        total_pages: Math.ceil(total / input.per_page),
      };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const baseWhere = { user_id: ctx.user.id, deleted_at: null };

    const FILE_TYPES: FileTypeCategory[] = ["image", "pdf", "video", "audio", "doc", "other"];

    // Use DB aggregates instead of fetching all rows into JS.
    const [totals, unreviewedCount, orphanCount, ...typeAggs] = await Promise.all([
      db.attachment.aggregate({
        _count: { id: true },
        _sum: { size_bytes: true },
        where: baseWhere,
      }),
      db.attachment.count({ where: { ...baseWhere, reviewed: false } }),
      db.attachment.count({ where: { ...baseWhere, parent_type: null } }),
      ...FILE_TYPES.map((ft) =>
        db.attachment.aggregate({
          _count: { id: true },
          _sum: { size_bytes: true },
          where: { ...baseWhere, ...fileTypeToPrismaFilter(ft) },
        }),
      ),
    ]);

    const total_count = totals._count.id;
    const total_bytes = totals._sum.size_bytes ?? 0;
    const unreviewed_count = unreviewedCount;
    const orphan_count = orphanCount;

    const by_type: Record<string, { count: number; bytes: number }> = {};
    FILE_TYPES.forEach((ft, i) => {
      const agg = typeAggs[i]!;
      by_type[ft] = {
        count: agg._count.id,
        bytes: agg._sum.size_bytes ?? 0,
      };
    });

    return { total_count, total_bytes, unreviewed_count, orphan_count, by_type };
  }),
});

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { storage, deleteFile } from "@/core/storage";
import { logActivity } from "@/core/audit";
import { z } from "zod";

const attachmentSelect = {
  id: true,
  file_id: true,
  filename: true,
  content_type: true,
  size_bytes: true,
  storage_path: true,
  thumbnail_path: true,
  position: true,
  description: true,
  reviewed: true,
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

export const attachmentsRouter = router({
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: {
          id: true,
          file_id: true,
          filename: true,
          parent_type: true,
          parent_id: true,
          task_id: true,
          thumbnail_path: true,
        },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }
      await deleteFile({ userId: ctx.user.id, fileId: attachment.file_id });
      if (attachment.thumbnail_path) {
        try {
          await storage.delete(attachment.thumbnail_path);
        } catch {
          /* ignore */
        }
      }
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Attachment",
        entity_id: attachment.id,
        action: "attachment_deleted",
        meta: { filename: attachment.filename },
      });
      if (attachment.task_id) {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: attachment.task_id,
          action: "attachment_deleted",
          meta: { filename: attachment.filename, attachment_id: attachment.id },
        });
      }
      return { ok: true };
    }),

  byTaskId: protectedProcedure
    .input(z.object({ task_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.task_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      const attachments = await db.attachment.findMany({
        where: {
          task_id: input.task_id,
          user_id: ctx.user.id,
          deleted_at: null,
        },
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: attachmentSelect,
      });

      return attachments;
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: {
          ...attachmentSelect,
          task_id: true,
        },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }
      return attachment;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        description: z.string().nullable().optional(),
        reviewed: z.boolean().optional(),
        tag_ids: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, filename: true, task_id: true },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }

      await db.attachment.update({
        where: { id: input.id },
        data: {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.reviewed !== undefined ? { reviewed: input.reviewed } : {}),
          ...(input.tag_ids !== undefined
            ? {
                tags: {
                  deleteMany: {},
                  create: input.tag_ids.map((tag_id) => ({ tag_id, created_at: new Date() })),
                },
              }
            : {}),
        },
      });

      const action =
        input.reviewed !== undefined ? "attachment_marked_reviewed" : "attachment_metadata_updated";
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Attachment",
        entity_id: attachment.id,
        action,
        meta: { filename: attachment.filename },
      });
      if (attachment.task_id) {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: attachment.task_id,
          action,
          meta: { filename: attachment.filename, attachment_id: attachment.id },
        });
      }

      return { ok: true };
    }),

  detach: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, filename: true, task_id: true, parent_type: true, parent_id: true },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }
      await db.attachment.update({
        where: { id: input.id },
        data: { task_id: null, parent_type: null, parent_id: null },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Attachment",
        entity_id: attachment.id,
        action: "attachment_detached",
        meta: {
          filename: attachment.filename,
          from_parent_type: attachment.parent_type,
          from_parent_id: attachment.parent_id,
        },
      });
      if (attachment.task_id) {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: attachment.task_id,
          action: "attachment_detached",
          meta: { filename: attachment.filename, attachment_id: attachment.id },
        });
      }
      return { ok: true };
    }),

  reattach: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        task_id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, filename: true },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }
      const task = await db.task.findFirst({
        where: { id: input.task_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }
      await db.attachment.update({
        where: { id: input.id },
        data: {
          task_id: input.task_id,
          parent_type: "Task",
          parent_id: input.task_id,
        },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Attachment",
        entity_id: attachment.id,
        action: "attachment_reattached",
        meta: { filename: attachment.filename, to_task_id: input.task_id },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.task_id,
        action: "attachment_uploaded",
        meta: { filename: attachment.filename, attachment_id: attachment.id },
      });
      return { ok: true };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const attachments = await db.attachment.findMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, file_id: true, thumbnail_path: true, filename: true },
      });
      for (const att of attachments) {
        try {
          await deleteFile({ userId: ctx.user.id, fileId: att.file_id });
          if (att.thumbnail_path) {
            await storage.delete(att.thumbnail_path).catch(() => {
              /* ignore */
            });
          }
        } catch {
          /* ignore individual failures */
        }
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Attachment",
          entity_id: att.id,
          action: "attachment_deleted",
          meta: { filename: att.filename },
        });
      }
      return { deleted: attachments.length };
    }),

  bulkDetach: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await db.attachment.updateMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id, deleted_at: null },
        data: { task_id: null, parent_type: null, parent_id: null },
      });
      return { detached: input.ids.length };
    }),

  bulkMarkReviewed: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()), reviewed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db.attachment.updateMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id, deleted_at: null },
        data: { reviewed: input.reviewed },
      });
      return { updated: input.ids.length };
    }),

  bulkTag: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()), tag_ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      for (const attachmentId of input.ids) {
        const exists = await db.attachment.findFirst({
          where: { id: attachmentId, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!exists) continue;
        for (const tagId of input.tag_ids) {
          await db.tagOnAttachment.upsert({
            where: { attachment_id_tag_id: { attachment_id: attachmentId, tag_id: tagId } },
            create: { attachment_id: attachmentId, tag_id: tagId },
            update: {},
          });
        }
      }
      return { updated: input.ids.length };
    }),

  byParentId: protectedProcedure
    .input(
      z.object({
        parent_type: z.string(),
        parent_id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return db.attachment.findMany({
        where: {
          parent_type: input.parent_type,
          parent_id: input.parent_id,
          user_id: ctx.user.id,
          deleted_at: null,
        },
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: attachmentSelect,
      });
    }),

  getUrl: protectedProcedure
    .input(z.object({ file_id: z.string() }))
    .query(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { file_id: input.file_id, user_id: ctx.user.id, deleted_at: null },
        select: {
          id: true,
          storage_path: true,
          thumbnail_path: true,
          filename: true,
          content_type: true,
        },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const url = await storage.getUrl({ path: attachment.storage_path, expiresInSeconds: 3600 });
      const thumbnailUrl = attachment.thumbnail_path
        ? await storage
            .getUrl({ path: attachment.thumbnail_path, expiresInSeconds: 3600 })
            .catch(() => null)
        : null;
      return {
        url,
        thumbnailUrl,
        filename: attachment.filename,
        contentType: attachment.content_type,
      };
    }),
});

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { deleteFile } from "@/core/storage";
import { z } from "zod";

export const attachmentsRouter = router({
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await db.attachment.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, file_id: true },
      });
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }
      await deleteFile({ userId: ctx.user.id, fileId: attachment.file_id });
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
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          file_id: true,
          filename: true,
          content_type: true,
          size_bytes: true,
          created_at: true,
        },
      });

      return attachments;
    }),
});

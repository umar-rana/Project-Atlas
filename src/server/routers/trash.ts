/**
 * trash router — canonical procedures for trash management.
 *
 *   trash.preview  — count soft-deleted items by entity type
 *   trash.empty    — permanently delete all soft-deleted items (requires confirmation_token)
 *
 * tasks.trashPreview is kept as a backwards-compat alias; tasks.emptyTrash has been
 * removed in favour of this router.
 */
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure, userOwned } from "@/server/trpc";
import { db } from "@/core/db";
import { withDeleted } from "@/core/db/soft-delete";

export const trashRouter = router({
  /**
   * trash.preview — returns the count of soft-deleted items by entity type.
   * Used to populate the Empty Trash confirmation dialog.
   */
  preview: protectedProcedure.query(async ({ ctx }) => {
    const [tasks, notes, projects, attachments] = await Promise.all([
      db.task.count({
        where: withDeleted<Prisma.TaskWhereInput>(
          userOwned(ctx.user, { NOT: { deleted_at: null } }),
        ),
      }),
      db.note.count({
        where: withDeleted<Prisma.NoteWhereInput>(
          userOwned(ctx.user, { NOT: { deleted_at: null } }),
        ),
      }),
      db.project.count({
        where: withDeleted<Prisma.ProjectWhereInput>(
          userOwned(ctx.user, { NOT: { deleted_at: null } }),
        ),
      }),
      db.attachment.count({
        where: withDeleted<Prisma.AttachmentWhereInput>(
          userOwned(ctx.user, { NOT: { deleted_at: null } }),
        ),
      }),
    ]);
    return { tasks, notes, projects, attachments };
  }),

  /**
   * trash.empty — permanently deletes all soft-deleted items for the user.
   * Requires confirmation_token === "DELETE" as a server-side guard.
   * Returns per-entity deleted counts.
   */
  empty: protectedProcedure
    .input(z.object({ confirmation_token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirmation_token !== "DELETE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'confirmation_token must be exactly "DELETE"',
        });
      }

      const tasks = await db.task.findMany({
        where: withDeleted<Prisma.TaskWhereInput>(
          userOwned(ctx.user, { NOT: { deleted_at: null } }),
        ),
        select: { id: true, referenced_tag_ids: true },
      });
      const ids = tasks.map((t) => t.id);

      const [noteCount, projectCount, attachmentCount] = await Promise.all([
        db.note.count({
          where: withDeleted<Prisma.NoteWhereInput>(
            userOwned(ctx.user, { NOT: { deleted_at: null } }),
          ),
        }),
        db.project.count({
          where: withDeleted<Prisma.ProjectWhereInput>(
            userOwned(ctx.user, { NOT: { deleted_at: null } }),
          ),
        }),
        db.attachment.count({
          where: withDeleted<Prisma.AttachmentWhereInput>(
            userOwned(ctx.user, { NOT: { deleted_at: null } }),
          ),
        }),
      ]);

      await db.$transaction(async (tx) => {
        if (ids.length > 0) {
          const tagJoins = await tx.tagOnTask.findMany({
            where: { task_id: { in: ids } },
            select: { tag_id: true },
          });
          const allRefTags = tasks.flatMap((t) => t.referenced_tag_ids);
          const tagDecrements = [...tagJoins.map((t) => t.tag_id), ...allRefTags];
          if (tagDecrements.length) {
            const counts = new Map<string, number>();
            for (const id of tagDecrements) counts.set(id, (counts.get(id) ?? 0) + 1);
            for (const [tagId, n] of counts) {
              await tx.tag.update({
                where: { id: tagId },
                data: { usage_count: { decrement: n } },
              });
            }
          }
          await tx.$executeRaw`DELETE FROM "Task" WHERE user_id = ${ctx.user.id} AND deleted_at IS NOT NULL`;
        }
        await tx.$executeRaw`DELETE FROM "Note" WHERE user_id = ${ctx.user.id} AND deleted_at IS NOT NULL`;
        await tx.$executeRaw`DELETE FROM "Project" WHERE user_id = ${ctx.user.id} AND deleted_at IS NOT NULL`;
        await tx.$executeRaw`DELETE FROM "Attachment" WHERE user_id = ${ctx.user.id} AND deleted_at IS NOT NULL`;
      });

      return {
        ok: true,
        deleted: {
          tasks: ids.length,
          notes: noteCount,
          projects: projectCount,
          attachments: attachmentCount,
        },
      };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { withDeleted } from "@/core/db/soft-delete";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import type { Prisma } from "@prisma/client";

const log = createLogger({ module: "admin-router" });

export const adminRouter = router({
  /**
   * Look up user records by Clerk ID or email address, including soft-deleted
   * accounts. Useful for identifying orphaned accounts after an auth re-association.
   */
  findUsers: adminProcedure
    .input(
      z
        .object({
          clerk_id: z.string().optional(),
          email: z.string().email().optional(),
        })
        .refine((v) => v.clerk_id || v.email, {
          message: "Provide at least one of clerk_id or email",
        }),
    )
    .query(async ({ input }) => {
      const orConditions: Prisma.UserWhereInput[] = [];
      if (input.clerk_id) orConditions.push({ clerk_id: input.clerk_id });
      if (input.email) orConditions.push({ email: input.email });

      const users = await db.user.findMany({
        where: withDeleted<Prisma.UserWhereInput>({ OR: orConditions }),
        select: {
          id: true,
          clerk_id: true,
          email: true,
          name: true,
          created_at: true,
          deleted_at: true,
          _count: { select: { tasks: true } },
        },
        orderBy: { created_at: "asc" },
      });

      return users.map((u) => ({
        id: u.id,
        clerk_id: u.clerk_id,
        email: u.email,
        name: u.name,
        created_at: u.created_at,
        deleted_at: u.deleted_at,
        task_count: u._count.tasks,
      }));
    }),

  /**
   * Re-link a user's Clerk ID to the correct (data-bearing) account, and
   * soft-delete the accidentally-created blank duplicate.
   *
   * Steps:
   *  1. Verify both user records exist.
   *  2. Confirm `blank_user_id` has no tasks (safety guard).
   *  3. Move the clerk_id from the blank record to the target record.
   *  4. Soft-delete the blank record.
   */
  relinkUser: adminProcedure
    .input(
      z.object({
        /** The correct (data-bearing) user record to restore access to. */
        target_user_id: z.string().uuid(),
        /** The blank duplicate that was accidentally created. */
        blank_user_id: z.string().uuid(),
        /** The Clerk user ID that should point to target_user_id. */
        clerk_id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [target, blank] = await Promise.all([
        db.user.findFirst({
          where: withDeleted<Prisma.UserWhereInput>({ id: input.target_user_id }),
          select: { id: true, email: true, clerk_id: true, deleted_at: true },
        }),
        db.user.findFirst({
          where: withDeleted<Prisma.UserWhereInput>({ id: input.blank_user_id }),
          select: { id: true, email: true, clerk_id: true, deleted_at: true },
        }),
      ]);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "target_user_id not found" });
      }
      if (!blank) {
        throw new TRPCError({ code: "NOT_FOUND", message: "blank_user_id not found" });
      }

      const [blankTaskCount, blankProjectCount, blankNoteCount] = await Promise.all([
        db.task.count({ where: { user_id: blank.id } }),
        db.project.count({ where: { user_id: blank.id } }),
        db.note.count({ where: { user_id: blank.id } }),
      ]);

      const nonEmptyEntities: string[] = [];
      if (blankTaskCount > 0) nonEmptyEntities.push(`${blankTaskCount} task(s)`);
      if (blankProjectCount > 0) nonEmptyEntities.push(`${blankProjectCount} project(s)`);
      if (blankNoteCount > 0) nonEmptyEntities.push(`${blankNoteCount} note(s)`);

      if (nonEmptyEntities.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `blank_user_id is not empty — it owns ${nonEmptyEntities.join(", ")}. Aborting to prevent data loss.`,
        });
      }

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: blank.id },
          data: { clerk_id: null },
        });

        await tx.user.update({
          where: { id: target.id },
          data: { clerk_id: input.clerk_id },
        });

        await tx.user.update({
          where: { id: blank.id },
          data: { deleted_at: new Date() },
        });
      });

      log.warn(
        {
          admin_user_id: ctx.user.id,
          target_user_id: input.target_user_id,
          blank_user_id: input.blank_user_id,
          clerk_id: input.clerk_id,
        },
        "Admin re-linked Clerk ID to existing user and soft-deleted blank duplicate",
      );

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "User",
        entity_id: input.target_user_id,
        action: "update",
        meta: {
          action: "admin_relink",
          clerk_id: input.clerk_id,
          blank_user_id: input.blank_user_id,
          performed_by: ctx.user.id,
        },
      });

      return {
        ok: true,
        message: `Clerk ID ${input.clerk_id} is now linked to user ${input.target_user_id}. Blank duplicate ${input.blank_user_id} was soft-deleted.`,
      };
    }),
});

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { z } from "zod";

export const emailsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().uuid().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const cursor = input?.cursor;

      const captures = await db.emailCapture.findMany({
        where: {
          user_id: ctx.user.id,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: [{ id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          from_address: true,
          subject: true,
          status: true,
          task_id: true,
          received_at: true,
          created_at: true,
        },
      });

      let nextCursor: string | undefined;
      if (captures.length > limit) {
        captures.pop();
        const last = captures[captures.length - 1];
        nextCursor = last?.id;
      }

      return {
        captures,
        nextCursor,
      };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const capture = await db.emailCapture.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!capture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email capture not found" });
      }
      return capture;
    }),

  discardCapture: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const capture = await db.emailCapture.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!capture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email capture not found" });
      }
      const updated = await db.emailCapture.update({
        where: { id: input.id },
        data: { status: "discarded" },
      });
      return updated;
    }),
});

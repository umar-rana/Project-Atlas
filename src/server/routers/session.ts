import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const sessionRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await db.session.findMany({
      where: {
        user_id: ctx.user.id,
        expires_at: { gt: new Date() },
      },
      orderBy: { last_seen: "desc" },
      select: {
        id: true,
        user_agent: true,
        ip_address: true,
        created_at: true,
        last_seen: true,
        expires_at: true,
      },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === ctx.sessionId,
    }));
  }),

  revoke: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sessionId === ctx.sessionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot revoke your current session. Use sign out instead.",
        });
      }

      const session = await db.session.findUnique({
        where: { id: input.sessionId },
        select: { user_id: true },
      });

      if (!session || session.user_id !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      await db.session.delete({ where: { id: input.sessionId } });
      return { success: true };
    }),

  revokeAll: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.sessionId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Cannot identify current session — try signing out and back in.",
      });
    }

    await db.session.deleteMany({
      where: {
        user_id: ctx.user.id,
        id: { not: ctx.sessionId },
      },
    });
    return { success: true };
  }),
});

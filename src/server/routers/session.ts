import { router, protectedProcedure } from "@/server/trpc";
import { clerkClient, auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const sessionRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const clerkId = ctx.user.clerk_id;
    if (!clerkId) return [];

    const { sessionId: currentSessionId } = await auth();
    const client = await clerkClient();

    const result = await client.sessions.getSessionList({
      userId: clerkId,
      status: "active",
    });

    return result.data.map((s) => ({
      id: s.id,
      user_agent: s.latestActivity?.browserName ?? null,
      ip_address: s.latestActivity?.ipAddress ?? null,
      last_seen: new Date(s.lastActiveAt),
      isCurrent: s.id === currentSessionId,
    }));
  }),

  revoke: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { sessionId: currentSessionId } = await auth();
      if (input.sessionId === currentSessionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot revoke your current session. Use sign out instead.",
        });
      }

      const client = await clerkClient();
      const session = await client.sessions.getSession(input.sessionId);
      if (session.userId !== ctx.user.clerk_id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      await client.sessions.revokeSession(input.sessionId);
      return { success: true };
    }),

  revokeAll: protectedProcedure.mutation(async ({ ctx }) => {
    const clerkId = ctx.user.clerk_id;
    if (!clerkId) return { success: true };

    const { sessionId: currentSessionId } = await auth();
    const client = await clerkClient();

    const result = await client.sessions.getSessionList({
      userId: clerkId,
      status: "active",
    });

    await Promise.all(
      result.data
        .filter((s) => s.id !== currentSessionId)
        .map((s) => client.sessions.revokeSession(s.id)),
    );

    return { success: true };
  }),
});

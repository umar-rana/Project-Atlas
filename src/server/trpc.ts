import 'server-only';
import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import { ZodError } from "zod";
import type { User } from "@prisma/client";

const log = createLogger({ module: "trpc" });

export interface TRPCContext {
  user: User | null;
}

export async function createTRPCContext(): Promise<TRPCContext> {
  const { userId } = await auth();
  if (!userId) return { user: null };

  const user = await db.user.findUnique({ where: { clerk_id: userId } });
  return { user };
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;

export const publicProcedure = t.procedure.use(async ({ next, ctx }) => {
  log.debug({ user: ctx.user?.id ?? "anonymous" }, "tRPC public call");
  return next();
});

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  log.debug({ userId: ctx.user.id }, "tRPC protected call");
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { isAdmin } = await import("@/lib/admin-gate");
  if (!ctx.user || !isAdmin(ctx.user)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  log.debug({ userId: ctx.user.id }, "tRPC admin call");
  return next({ ctx: { ...ctx, user: ctx.user } });
});

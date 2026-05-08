import "server-only";
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

// ---------------------------------------------------------------------------
// User-ownership helpers (audit M-AUTH-1 / M-CODE-1)
//
// All user-owned data MUST be filtered by user_id at the query level. These
// helpers make that contract named, discoverable, and DRY instead of relying
// on 137 hand-written `{ user_id: ctx.user.id, deleted_at: null }` objects
// scattered across routers.
//
// Conventions:
//   - `userOwnedActive(user, extra?)`: standard filter for soft-delete tables
//     (Task, Note, Project, Capture, Attachment, etc.). Excludes trash.
//   - `userOwned(user, extra?)`:        for tables without `deleted_at`
//     (Link, Tag, Context, AICallLog, AuditLog, etc.).
//   - `assertOwned(record, user)`:      after-fetch defense-in-depth check.
//     Throws NOT_FOUND if the record is null or its user_id does not match.
//     Use when you've fetched by primary key without a user_id filter (rare;
//     normally prefer the where-clause helpers).
//
// Future work: a Prisma client extension that fails closed on user-scoped
// models when `where.user_id` is missing would convert this convention into
// an enforced invariant. That's tracked as a separate followup.
// ---------------------------------------------------------------------------

type UserScoped<T> = T & { user_id: string };

export function userOwned<T extends Record<string, unknown>>(
  user: User,
  extra?: T,
): UserScoped<T> {
  return { user_id: user.id, ...(extra ?? ({} as T)) } as UserScoped<T>;
}

export function userOwnedActive<T extends Record<string, unknown>>(
  user: User,
  extra?: T,
): UserScoped<T> & { deleted_at: null } {
  return {
    user_id: user.id,
    deleted_at: null,
    ...(extra ?? ({} as T)),
  } as UserScoped<T> & { deleted_at: null };
}

export function assertOwned<R extends { user_id: string }>(
  record: R | null | undefined,
  user: User,
): asserts record is R {
  if (!record || record.user_id !== user.id) {
    log.warn(
      { userId: user.id, foundUserId: record?.user_id ?? null },
      "assertOwned: cross-user access blocked",
    );
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

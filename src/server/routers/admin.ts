import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { withDeleted } from "@/core/db/soft-delete";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import {
  verifyIsOrphan,
  reattachOrphanData,
  flagForRecoveryNotification,
} from "@/core/auth/orphan-recovery";
import {
  runInboxMigrationDryRun,
  runInboxMigrationForUser,
  saveMigrationSummaryForUser,
} from "@/core/capture/inbox-migration";
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
   */
  relinkUser: adminProcedure
    .input(
      z.object({
        target_user_id: z.string().uuid(),
        blank_user_id: z.string().uuid(),
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
          where: { id: target.id },
          data: { clerk_id: input.clerk_id },
        });
        await tx.$executeRaw`UPDATE "User" SET clerk_id = 'reassigned_' || id::text, deleted_at = NOW() WHERE id = ${blank.id}::uuid`;
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
          actor_type: "admin",
        },
      });

      return {
        ok: true,
        message: `Clerk ID ${input.clerk_id} is now linked to user ${input.target_user_id}. Blank duplicate ${input.blank_user_id} was soft-deleted.`,
      };
    }),

  // ─── System Metrics ────────────────────────────────────────────────────────

  systemMetrics: adminProcedure.query(async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      deletedUsers,
      totalTasks,
      totalProjects,
      totalNotes,
      recentRecoveries,
      recentAuthEvents,
      jobRows,
    ] = await Promise.all([
      db.user.count({ where: withDeleted({}) }),
      db.user.count(),
      db.user.count({ where: withDeleted<Prisma.UserWhereInput>({ NOT: { deleted_at: null } }) }),
      db.task.count(),
      db.project.count(),
      db.note.count(),
      db.auditLog.count({
        where: {
          action: "auth:resolved_by_orphan_recovery",
          created_at: { gte: thirtyDaysAgo },
        },
      }),
      db.auditLog.count({
        where: {
          action: {
            in: [
              "auth:resolved_by_clerk_id",
              "auth:resolved_by_email_fallback",
              "auth:resolved_by_orphan_recovery",
              "auth:created_new_user",
            ],
          },
          created_at: { gte: oneDayAgo },
        },
      }),
      db.$queryRaw<Array<{ name: string; state: string }>>` 
        SELECT name, 'active' as state FROM pgboss.schedule LIMIT 50
      `.catch(() => [] as Array<{ name: string; state: string }>),
    ]);

    return {
      users: { total: totalUsers, active: activeUsers, deleted: deletedUsers },
      content: { tasks: totalTasks, projects: totalProjects, notes: totalNotes },
      recovery: { last30Days: recentRecoveries },
      authEvents: { last24Hours: recentAuthEvents },
      jobs: { scheduled: jobRows.length },
    };
  }),

  // ─── Users ─────────────────────────────────────────────────────────────────

  users: router({
    list: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          filter: z.enum(["active", "deleted", "all"]).default("active"),
          sort: z.enum(["created_at", "name", "email", "updated_at"]).default("created_at"),
          sortDir: z.enum(["asc", "desc"]).default("desc"),
          cursor: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      )
      .query(async ({ input }) => {
        const searchClause: Prisma.UserWhereInput = input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { email: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {};

        const filterClause: Prisma.UserWhereInput =
          input.filter === "deleted"
            ? withDeleted<Prisma.UserWhereInput>({ NOT: { deleted_at: null } })
            : input.filter === "all"
              ? withDeleted<Prisma.UserWhereInput>({})
              : {};

        const where: Prisma.UserWhereInput = input.search
          ? { AND: [filterClause, searchClause] }
          : filterClause;

        const users = await db.user.findMany({
          where,
          select: {
            id: true,
            clerk_id: true,
            email: true,
            name: true,
            image: true,
            created_at: true,
            updated_at: true,
            deleted_at: true,
            recovery_notification_pending: true,
            _count: {
              select: {
                tasks: true,
                projects: true,
                notes: true,
              },
            },
          },
          orderBy: [{ [input.sort]: input.sortDir }, { id: "asc" }],
          take: input.limit + 1,
          skip: input.cursor ? 1 : 0,
          cursor: input.cursor ? { id: input.cursor } : undefined,
        });

        let nextCursor: string | undefined;
        if (users.length > input.limit) {
          nextCursor = users[input.limit]?.id;
          users.splice(input.limit);
        }

        return {
          users: users.map((u) => ({
            id: u.id,
            clerk_id: u.clerk_id,
            email: u.email,
            name: u.name,
            image: u.image,
            created_at: u.created_at,
            updated_at: u.updated_at,
            deleted_at: u.deleted_at,
            recovery_notification_pending: u.recovery_notification_pending,
            counts: {
              tasks: u._count.tasks,
              projects: u._count.projects,
              notes: u._count.notes,
            },
          })),
          nextCursor,
        };
      }),

    byId: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const user = await db.user.findFirst({
          where: withDeleted<Prisma.UserWhereInput>({ id: input.id }),
          select: {
            id: true,
            clerk_id: true,
            email: true,
            name: true,
            image: true,
            created_at: true,
            updated_at: true,
            deleted_at: true,
            timezone: true,
            locale_preset: true,
            language: true,
            recovery_notification_pending: true,
            last_recovery_summary: true,
            last_recovery_dismissed_at: true,
            _count: {
              select: {
                tasks: true,
                projects: true,
                notes: true,
                captures: true,
                attachments: true,
                tags: true,
                contexts: true,
                links: true,
                tables: true,
                email_captures: true,
              },
            },
          },
        });

        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentAuthEvents = await db.auditLog.findMany({
          where: {
            user_id: input.id,
            action: {
              in: [
                "auth:resolved_by_clerk_id",
                "auth:resolved_by_email_fallback",
                "auth:resolved_by_orphan_recovery",
                "auth:created_new_user",
                "auth:failed",
              ],
            },
            created_at: { gte: thirtyDaysAgo },
          },
          orderBy: { created_at: "desc" },
          take: 20,
          select: {
            id: true,
            action: true,
            meta: true,
            created_at: true,
          },
        });

        await logActivity({
          user_id: ctx.user.id,
          entity_type: "User",
          entity_id: input.id,
          action: "admin_viewed_user",
          meta: {
            actor_type: "admin",
            viewed_user_id: input.id,
          },
        });

        return {
          id: user.id,
          clerk_id: user.clerk_id,
          email: user.email,
          name: user.name,
          image: user.image,
          created_at: user.created_at,
          updated_at: user.updated_at,
          deleted_at: user.deleted_at,
          timezone: user.timezone,
          locale_preset: user.locale_preset,
          language: user.language,
          recovery_notification_pending: user.recovery_notification_pending,
          last_recovery_summary: user.last_recovery_summary as Record<string, unknown> | null,
          last_recovery_dismissed_at: user.last_recovery_dismissed_at,
          counts: {
            tasks: user._count.tasks,
            projects: user._count.projects,
            notes: user._count.notes,
            captures: user._count.captures,
            attachments: user._count.attachments,
            tags: user._count.tags,
            contexts: user._count.contexts,
            links: user._count.links,
            tables: user._count.tables,
            emailCaptures: user._count.email_captures,
          },
          recentAuthEvents: recentAuthEvents.map((e) => ({
            id: e.id,
            action: e.action,
            meta: e.meta as Record<string, unknown> | null,
            created_at: e.created_at,
            isWarning: e.action === "auth:failed",
          })),
        };
      }),
  }),

  // ─── Audit Log ─────────────────────────────────────────────────────────────

  audit: router({
    search: adminProcedure
      .input(
        z.object({
          action: z.string().optional(),
          user_id: z.string().uuid().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          warningOnly: z.boolean().default(false),
          excludeAdminViews: z.boolean().default(true),
          cursor: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      )
      .query(async ({ input }) => {
        const andConditions: Prisma.AuditLogWhereInput[] = [];

        if (input.user_id) {
          andConditions.push({ user_id: input.user_id });
        }
        if (input.dateFrom || input.dateTo) {
          andConditions.push({
            created_at: {
              ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
              ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
            },
          });
        }
        if (input.action) {
          andConditions.push({ action: { contains: input.action, mode: "insensitive" } });
        }
        if (input.warningOnly) {
          andConditions.push({
            OR: [
              { action: { contains: "fail", mode: "insensitive" } },
              { action: { contains: "error", mode: "insensitive" } },
            ],
          });
        }
        if (input.excludeAdminViews) {
          andConditions.push({ action: { not: "admin_viewed_user" } });
        }

        const where: Prisma.AuditLogWhereInput =
          andConditions.length > 0 ? { AND: andConditions } : {};

        const entries = await db.auditLog.findMany({
          where,
          orderBy: [{ created_at: "desc" }, { id: "asc" }],
          take: input.limit + 1,
          skip: input.cursor ? 1 : 0,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          select: {
            id: true,
            user_id: true,
            entity_type: true,
            entity_id: true,
            action: true,
            diff: true,
            meta: true,
            created_at: true,
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        });

        let nextCursor: string | undefined;
        if (entries.length > input.limit) {
          nextCursor = entries[input.limit]?.id;
          entries.splice(input.limit);
        }

        return {
          entries: entries.map((e) => ({
            id: e.id,
            user_id: e.user_id,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
            action: e.action,
            diff: e.diff as Record<string, unknown> | null,
            meta: e.meta as Record<string, unknown> | null,
            created_at: e.created_at,
            user: e.user,
            isWarning: e.action.includes("fail") || e.action.includes("error"),
          })),
          nextCursor,
        };
      }),
  }),

  // ─── Recoveries ────────────────────────────────────────────────────────────

  recoveries: router({
    list: adminProcedure
      .input(
        z.object({
          cursor: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      )
      .query(async ({ input }) => {
        const entries = await db.auditLog.findMany({
          where: { action: "auth:resolved_by_orphan_recovery" },
          orderBy: [{ created_at: "desc" }, { id: "asc" }],
          take: input.limit + 1,
          skip: input.cursor ? 1 : 0,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          select: {
            id: true,
            user_id: true,
            entity_id: true,
            meta: true,
            created_at: true,
            user: { select: { id: true, email: true, name: true } },
          },
        });

        let nextCursor: string | undefined;
        if (entries.length > input.limit) {
          nextCursor = entries[input.limit]?.id;
          entries.splice(input.limit);
        }

        const flaggedIds = await db.auditLog.findMany({
          where: { action: "admin_flagged_recovery" },
          select: { entity_id: true },
        });
        const flaggedSet = new Set(flaggedIds.map((f) => f.entity_id));

        return {
          recoveries: entries.map((e) => ({
            id: e.id,
            user_id: e.user_id,
            entity_id: e.entity_id,
            meta: e.meta as Record<string, unknown> | null,
            created_at: e.created_at,
            user: e.user,
            isFlagged: flaggedSet.has(e.id),
          })),
          nextCursor,
        };
      }),

    byId: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
      const entry = await db.auditLog.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          user_id: true,
          entity_id: true,
          action: true,
          meta: true,
          created_at: true,
          user: { select: { id: true, email: true, name: true } },
        },
      });

      if (!entry || entry.action !== "auth:resolved_by_orphan_recovery") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recovery event not found" });
      }

      const meta = entry.meta as Record<string, unknown> | null;
      const orphanId = meta?.orphan_id as string | undefined;

      let relatedAuditEntries: Array<{
        id: string;
        action: string;
        created_at: Date;
        meta: unknown;
      }> = [];
      if (orphanId) {
        relatedAuditEntries = await db.auditLog.findMany({
          where: {
            OR: [{ entity_id: orphanId }, { entity_id: entry.entity_id }],
            id: { not: entry.id },
          },
          orderBy: { created_at: "desc" },
          take: 20,
          select: { id: true, action: true, created_at: true, meta: true },
        });
      }

      const isFlagged = await db.auditLog.findFirst({
        where: { action: "admin_flagged_recovery", entity_id: input.id },
        select: { id: true },
      });

      return {
        id: entry.id,
        user_id: entry.user_id,
        entity_id: entry.entity_id,
        meta,
        created_at: entry.created_at,
        user: entry.user,
        isFlagged: Boolean(isFlagged),
        relatedAuditEntries: relatedAuditEntries.map((e) => ({
          id: e.id,
          action: e.action,
          created_at: e.created_at,
          meta: e.meta as Record<string, unknown> | null,
        })),
      };
    }),

    flag: adminProcedure
      .input(z.object({ recovery_id: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await db.auditLog.findUnique({
          where: { id: input.recovery_id },
          select: { id: true, action: true },
        });

        if (!entry || entry.action !== "auth:resolved_by_orphan_recovery") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Recovery event not found" });
        }

        await logActivity({
          user_id: ctx.user.id,
          entity_type: "User",
          entity_id: input.recovery_id,
          action: "admin_flagged_recovery",
          meta: {
            actor_type: "admin",
            recovery_id: input.recovery_id,
            reason: input.reason ?? null,
            performed_by: ctx.user.id,
          },
        });

        log.warn(
          { admin_user_id: ctx.user.id, recovery_id: input.recovery_id },
          "Admin flagged recovery as wrong",
        );

        return { ok: true };
      }),
  }),

  // ─── Orphans ────────────────────────────────────────────────────────────────

  orphans: router({
    listPossible: adminProcedure
      .input(
        z.object({
          cursor: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      )
      .query(async ({ input }) => {
        const candidatesRaw = await db.user.findMany({
          where: withDeleted<Prisma.UserWhereInput>({ NOT: { deleted_at: null } }),
          select: {
            id: true,
            email: true,
            name: true,
            clerk_id: true,
            created_at: true,
            deleted_at: true,
            _count: {
              select: { tasks: true, projects: true, notes: true },
            },
          },
          orderBy: [{ created_at: "desc" }, { id: "asc" }],
          take: input.limit + 1,
          skip: input.cursor ? 1 : 0,
          cursor: input.cursor ? { id: input.cursor } : undefined,
        });

        let nextCursor: string | undefined;
        if (candidatesRaw.length > input.limit) {
          nextCursor = candidatesRaw[input.limit]?.id;
          candidatesRaw.splice(input.limit);
        }

        const candidates = candidatesRaw.filter(
          (u) => u._count.tasks > 0 || u._count.projects > 0 || u._count.notes > 0,
        );

        return {
          orphans: candidates.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            clerk_id: u.clerk_id,
            created_at: u.created_at,
            deleted_at: u.deleted_at,
            counts: {
              tasks: u._count.tasks,
              projects: u._count.projects,
              notes: u._count.notes,
            },
          })),
          nextCursor,
        };
      }),

    investigate: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const orphan = await db.user.findFirst({
          where: withDeleted<Prisma.UserWhereInput>({ id: input.id }),
          select: {
            id: true,
            email: true,
            name: true,
            clerk_id: true,
            created_at: true,
            deleted_at: true,
            _count: {
              select: { tasks: true, projects: true, notes: true, captures: true },
            },
          },
        });

        if (!orphan) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orphan not found" });
        }

        const [sampleTasks, sampleProjects] = await Promise.all([
          db.task.findMany({
            where: { user_id: input.id },
            select: { id: true, title: true, created_at: true },
            orderBy: { created_at: "desc" },
            take: 5,
          }),
          db.project.findMany({
            where: { user_id: input.id },
            select: { id: true, title: true, created_at: true },
            orderBy: { created_at: "desc" },
            take: 5,
          }),
        ]);

        const recentAuthEvents = await db.auditLog.findMany({
          where: {
            user_id: input.id,
            action: {
              in: [
                "auth:resolved_by_clerk_id",
                "auth:resolved_by_email_fallback",
                "auth:resolved_by_orphan_recovery",
                "auth:created_new_user",
                "auth:failed",
              ],
            },
          },
          orderBy: { created_at: "desc" },
          take: 10,
          select: { id: true, action: true, created_at: true, meta: true },
        });

        return {
          id: orphan.id,
          email: orphan.email,
          name: orphan.name,
          clerk_id: orphan.clerk_id,
          created_at: orphan.created_at,
          deleted_at: orphan.deleted_at,
          counts: {
            tasks: orphan._count.tasks,
            projects: orphan._count.projects,
            notes: orphan._count.notes,
            captures: orphan._count.captures,
          },
          sampleTasks: sampleTasks.map((t) => ({
            id: t.id,
            title: t.title,
            created_at: t.created_at,
          })),
          sampleProjects: sampleProjects.map((p) => ({
            id: p.id,
            title: p.title,
            created_at: p.created_at,
          })),
          recentAuthEvents: recentAuthEvents.map((e) => ({
            id: e.id,
            action: e.action,
            created_at: e.created_at,
            meta: e.meta as Record<string, unknown> | null,
          })),
        };
      }),

    reattach: adminProcedure
      .input(
        z.object({
          orphan_id: z.string().uuid(),
          target_user_id: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [orphan, targetUser] = await Promise.all([
          db.user.findFirst({
            where: withDeleted<Prisma.UserWhereInput>({ id: input.orphan_id }),
          }),
          db.user.findUnique({ where: { id: input.target_user_id } }),
        ]);

        if (!orphan) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orphan user not found" });
        }
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
        }
        if (orphan.id === targetUser.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot reattach a user to themselves",
          });
        }

        const orphanConfirmed = await verifyIsOrphan(orphan);
        if (!orphanConfirmed) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This user does not qualify as an orphan — they have recent auth activity or no recoverable content. Reattachment aborted.",
          });
        }

        const { counts, orphanIds } = await reattachOrphanData(targetUser, [orphan]);
        await flagForRecoveryNotification(targetUser.id, counts, orphanIds);

        await logActivity({
          user_id: ctx.user.id,
          entity_type: "User",
          entity_id: input.target_user_id,
          action: "admin_reattach_orphan",
          meta: {
            actor_type: "admin",
            orphan_id: input.orphan_id,
            target_user_id: input.target_user_id,
            performed_by: ctx.user.id,
            counts,
          },
        });

        log.warn(
          {
            admin_user_id: ctx.user.id,
            orphan_id: input.orphan_id,
            target_user_id: input.target_user_id,
          },
          "Admin manually reattached orphan data",
        );

        return { ok: true, counts };
      }),

    softDelete: adminProcedure
      .input(
        z.object({
          orphan_id: z.string().uuid(),
          reason: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const orphan = await db.user.findFirst({
          where: withDeleted<Prisma.UserWhereInput>({ id: input.orphan_id }),
          select: { id: true, email: true, deleted_at: true },
        });

        if (!orphan) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orphan user not found" });
        }

        if (orphan.deleted_at) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User is already soft-deleted.",
          });
        }

        const fullOrphan = await db.user.findFirstOrThrow({
          where: withDeleted<Prisma.UserWhereInput>({ id: orphan.id }),
        });
        const orphanConfirmed = await verifyIsOrphan(fullOrphan);
        if (!orphanConfirmed) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This user does not qualify as an orphan — they have recent auth activity. Soft-delete aborted to prevent data loss.",
          });
        }

        await db.user.update({
          where: { id: orphan.id },
          data: { deleted_at: new Date() },
        });

        await logActivity({
          user_id: ctx.user.id,
          entity_type: "User",
          entity_id: input.orphan_id,
          action: "admin_soft_delete_orphan",
          meta: {
            actor_type: "admin",
            orphan_id: input.orphan_id,
            orphan_email: orphan.email,
            reason: input.reason ?? null,
            performed_by: ctx.user.id,
          },
        });

        log.warn(
          { admin_user_id: ctx.user.id, orphan_id: input.orphan_id },
          "Admin soft-deleted orphan user",
        );

        return { ok: true };
      }),
  }),

  runMigrationForAllUsers: adminProcedure
    .input(
      z.object({
        dry_run: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const users = await db.user.findMany({
        where: { deleted_at: null },
        select: { id: true, email: true },
      });

      const userIds = users.map((u) => u.id);

      if (input.dry_run) {
        const result = await runInboxMigrationDryRun(userIds);
        return {
          dry_run: true as const,
          userCount: users.length,
          totalCategoryA: Object.values(result.byUser).reduce((sum, u) => sum + u.categoryA, 0),
          totalCategoryB: Object.values(result.byUser).reduce((sum, u) => sum + u.categoryB, 0),
          totalItems: Object.values(result.byUser).reduce((sum, u) => sum + u.total, 0),
        };
      }

      let totalConverted = 0;
      let totalKept = 0;
      let totalErrors = 0;
      const ranAt = new Date().toISOString();

      for (const user of users) {
        try {
          const result = await runInboxMigrationForUser(user.id);
          totalConverted += result.converted;
          totalKept += result.kept;
          totalErrors += result.errors;
          await saveMigrationSummaryForUser(user.id, {
            converted: result.converted,
            kept: result.kept,
            errors: result.errors,
            ranAt,
          });
        } catch (err) {
          log.error({ userId: user.id, err }, "Error migrating inbox for user");
          totalErrors += 1;
        }
      }

      log.info(
        { adminUserId: ctx.user.id, totalConverted, totalKept, totalErrors },
        "Admin ran inbox migration for all users",
      );

      return {
        dry_run: false as const,
        userCount: users.length,
        totalConverted,
        totalKept,
        totalErrors,
      };
    }),
});

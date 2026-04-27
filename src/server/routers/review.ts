import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { logActivity } from "@/core/audit";

const REVIEW_ACTION = z.enum(["keep_active", "on_hold", "completed", "dropped", "skip"]);

export const reviewRouter = router({
  queue: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();

    const projects = await db.project.findMany({
      where: {
        user_id: userId,
        status: "active",
        deleted_at: null,
        review_interval_days: { not: null },
      },
    });

    const overdue = projects
      .filter((p) => {
        if (!p.review_interval_days) return false;
        if (!p.last_reviewed_at) return true;
        const intervalMs = p.review_interval_days * 24 * 60 * 60 * 1000;
        return now.getTime() - p.last_reviewed_at.getTime() >= intervalMs;
      })
      .sort((a, b) => {
        // Sort by most overdue first: (now - last_reviewed_at) / review_interval_days DESC
        const overdueRatio = (p: typeof a): number => {
          if (!p.last_reviewed_at) return Infinity;
          const ageMs = now.getTime() - p.last_reviewed_at.getTime();
          const intervalMs = (p.review_interval_days ?? 7) * 24 * 60 * 60 * 1000;
          return ageMs / intervalMs;
        };
        return overdueRatio(b) - overdueRatio(a);
      });

    const taskCounts = await db.task.groupBy({
      by: ["project_id"],
      where: {
        project_id: { in: overdue.map((p) => p.id) },
        status: "active",
        deleted_at: null,
      },
      _count: { _all: true },
    });
    const countMap = new Map(
      taskCounts
        .filter((c) => c.project_id != null)
        .map((c) => [c.project_id as string, c._count._all]),
    );

    return {
      projects: overdue.map((p) => ({
        ...p,
        task_count: countMap.get(p.id) ?? 0,
      })),
      overdue_count: overdue.length,
    };
  }),

  projectDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const [tasks, recentActivity] = await Promise.all([
        db.task.findMany({
          where: {
            project_id: project.id,
            deleted_at: null,
          },
          orderBy: [{ status: "asc" }, { position: "asc" }],
          take: 30,
        }),
        db.auditLog.findMany({
          where: { entity_type: "Project", entity_id: project.id },
          orderBy: { created_at: "desc" },
          take: 10,
        }),
      ]);

      const activeTasks = tasks.filter((t) => t.status === "active");
      const staleThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const staleTasks = activeTasks.filter(
        (t) => !t.due_date && t.updated_at < staleThreshold,
      );

      const incomplete_count = activeTasks.length;

      return {
        project,
        tasks,
        stale_tasks: staleTasks,
        recent_activity: recentActivity,
        incomplete_count,
      };
    }),

  reviewProject: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        action: REVIEW_ACTION,
        notes: z.string().max(10_000).optional(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: userId, deleted_at: null },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.action === "completed") {
        const incompleteCount = await db.task.count({
          where: { project_id: input.id, status: "active", deleted_at: null },
        });
        if (incompleteCount > 0 && !input.force) {
          return { ok: false, needs_confirmation: true, incomplete_count: incompleteCount };
        }
      }

      const now = new Date();
      const updateData: Record<string, unknown> = {
        last_reviewed_at: now,
      };

      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }

      if (input.action === "keep_active") {
        // Just update last_reviewed_at
      } else if (input.action === "on_hold") {
        updateData.status = "on_hold";
      } else if (input.action === "completed") {
        updateData.status = "completed";
        updateData.completed_at = now;
        if (input.force) {
          await db.task.updateMany({
            where: { project_id: input.id, status: "active", deleted_at: null },
            data: { status: "completed", completed_at: now },
          });
        }
      } else if (input.action === "dropped") {
        updateData.status = "dropped";
      } else if (input.action === "skip") {
        // Don't update last_reviewed_at for skipped projects
        delete updateData.last_reviewed_at;
      }

      await db.project.update({
        where: { id: input.id },
        data: updateData,
      });

      await logActivity({
        user_id: userId,
        entity_type: "Project",
        entity_id: input.id,
        action: "review_completed",
        meta: { review_action: input.action },
      });

      return { ok: true, needs_confirmation: false, incomplete_count: 0 };
    }),

  markForReview: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: userId, deleted_at: null },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // Ensure the project has a review interval so it shows in the review queue.
      // If it doesn't, set it to the user's default or 7 days.
      const updateData: { last_reviewed_at: Date | null; review_interval_days?: number } = {
        last_reviewed_at: null,
      };
      if (!project.review_interval_days) {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { tasks_prefs: true },
        });
        const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
        updateData.review_interval_days =
          typeof prefs.default_review_interval_days === "number"
            ? prefs.default_review_interval_days
            : 7;
      }

      await db.project.update({
        where: { id: input.id },
        data: updateData,
      });

      await logActivity({
        user_id: userId,
        entity_type: "Project",
        entity_id: input.id,
        action: "mark_for_review",
        meta: { project_id: input.id },
      });

      return { ok: true };
    }),

  overdueCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();

    const projects = await db.project.findMany({
      where: {
        user_id: userId,
        status: "active",
        deleted_at: null,
        review_interval_days: { not: null },
      },
      select: { id: true, last_reviewed_at: true, review_interval_days: true },
    });

    const count = projects.filter((p) => {
      if (!p.review_interval_days) return false;
      if (!p.last_reviewed_at) return true;
      const intervalMs = p.review_interval_days * 24 * 60 * 60 * 1000;
      return now.getTime() - p.last_reviewed_at.getTime() >= intervalMs;
    }).length;

    return { count };
  }),
});

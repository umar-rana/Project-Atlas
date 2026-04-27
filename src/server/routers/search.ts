import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";

interface TaskSearchHit {
  id: string;
  title: string;
  project_id: string | null;
  project_title: string | null;
  perspective: string;
}

export const searchRouter = router({
  tasks: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(50).default(15),
      }),
    )
    .query(async ({ ctx, input }): Promise<TaskSearchHit[]> => {
      const q = input.query.trim();
      if (!q) return [];

      // Full-text search via Postgres `to_tsvector` over title+notes,
      // combined with an ILIKE fallback so prefix and partial-word
      // matches still surface useful hits.
      const ilike = `%${q}%`;
      const userId = ctx.user.id;
      const limit = input.limit;
      type Row = {
        id: string;
        title: string;
        notes: string | null;
        project_id: string | null;
        flagged: boolean;
        due_date: Date | null;
        defer_date: Date | null;
      };
      const rows = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT t.id, t.title, t.notes, t.project_id, t.flagged,
               t.due_date, t.defer_date
        FROM "Task" t
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND (
            to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.notes, ''))
              @@ websearch_to_tsquery('english', ${q})
            OR t.title ILIKE ${ilike}
            OR t.notes ILIKE ${ilike}
          )
        ORDER BY t.flagged DESC, t.updated_at DESC
        LIMIT ${limit}
      `);

      const projectIds = Array.from(
        new Set(rows.map((r) => r.project_id).filter((id): id is string => Boolean(id))),
      );
      const projects = projectIds.length
        ? await db.project.findMany({
            where: { id: { in: projectIds }, user_id: userId },
            select: { id: true, title: true },
          })
        : [];
      const projectMap = new Map(projects.map((p) => [p.id, p.title]));

      // Mirror the perspective rules used by tasks.list so the command
      // palette navigates to the route the task actually appears in.
      const endOfToday = new Date();
      endOfToday.setHours(0, 0, 0, 0);
      endOfToday.setDate(endOfToday.getDate() + 1);

      function classify(t: Row): string {
        const dueByToday = t.due_date != null && t.due_date < endOfToday;
        const deferredByToday = t.defer_date != null && t.defer_date < endOfToday;
        const flaggedNoDue = t.flagged && t.due_date == null;
        if (dueByToday || deferredByToday || flaggedNoDue) return "today";
        if (t.flagged) return "flagged";
        if (t.project_id) return "project";
        return "inbox";
      }

      return rows.map((t) => ({
        id: t.id,
        title: t.title,
        project_id: t.project_id,
        project_title: t.project_id ? projectMap.get(t.project_id) ?? null : null,
        perspective: classify(t),
      }));
    }),
});

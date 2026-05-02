import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";

export const linksRouter = router({
  outbound: protectedProcedure
    .input(
      z.object({
        source_type: z.enum(["Note", "Task"]),
        source_id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return db.link.findMany({
        where: {
          user_id: ctx.user.id,
          source_type: input.source_type,
          source_id: input.source_id,
        },
        select: {
          id: true,
          target_type: true,
          target_id: true,
          relation: true,
          source_excerpt: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      });
    }),

  inbound: protectedProcedure
    .input(
      z.object({
        target_type: z.enum(["Note", "Task", "Project", "Tag", "Context"]),
        target_id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const links = await db.link.findMany({
        where: {
          user_id: ctx.user.id,
          target_type: input.target_type,
          target_id: input.target_id,
        },
        select: {
          id: true,
          source_type: true,
          source_id: true,
          relation: true,
          source_excerpt: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      });

      const noteIds = links.filter((l) => l.source_type === "Note").map((l) => l.source_id);
      const taskIds = links.filter((l) => l.source_type === "Task").map((l) => l.source_id);

      const [sourceNotes, sourceTasks] = await Promise.all([
        noteIds.length
          ? db.note.findMany({
              where: { id: { in: noteIds }, user_id: ctx.user.id },
              select: { id: true, title: true },
            })
          : [],
        taskIds.length
          ? db.task.findMany({
              where: { id: { in: taskIds }, user_id: ctx.user.id },
              select: { id: true, title: true },
            })
          : [],
      ]);

      const titleMap = new Map<string, string>([
        ...sourceNotes.map((n) => [n.id, n.title || "Untitled"] as [string, string]),
        ...sourceTasks.map((t) => [t.id, t.title] as [string, string]),
      ]);

      return links.map((l) => ({
        id: l.id,
        source_type: l.source_type,
        source_id: l.source_id,
        source_title: titleMap.get(l.source_id),
        source_excerpt: l.source_excerpt,
        relation: l.relation,
        created_at: l.created_at,
      }));
    }),
});

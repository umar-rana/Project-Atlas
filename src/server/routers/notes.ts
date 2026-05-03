import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { extractReferenceNodes } from "@/core/links/resolver";
import { syncLinksForSource } from "@/core/links/service";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "notes-router" });

export const notesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        purpose: z
          .enum(["note", "meeting_note", "project_brief", "reading_note"])
          .optional(),
        is_project_brief: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.NoteWhereInput = {
        user_id: ctx.user.id,
        deleted_at: null,
        ...(input.folder_id !== undefined ? { folder_id: input.folder_id } : {}),
        ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.is_project_brief !== undefined ? { is_project_brief: input.is_project_brief } : {}),
      };

      const notes = await db.note.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { updated_at: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          purpose: true,
          pinned: true,
          folder_id: true,
          project_id: true,
          word_count: true,
          is_project_brief: true,
          created_at: true,
          updated_at: true,
          body_text: true,
        },
      });

      let nextCursor: string | undefined;
      if (notes.length > input.limit) {
        nextCursor = notes.pop()!.id;
      }

      return { notes, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      return note;
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().max(500).default(""),
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        purpose: z
          .enum(["note", "meeting_note", "project_brief", "reading_note"])
          .default("note"),
        body_json: z.string().optional(),
        body_text: z.string().optional(),
        body_markdown: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folder_id) {
        const folder = await db.notesFolder.findFirst({
          where: { id: input.folder_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      }
      if (input.project_id) {
        const project = await db.project.findFirst({
          where: { id: input.project_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const noteId = newId();
      const wordCount = input.body_text
        ? input.body_text.split(/\s+/).filter(Boolean).length
        : 0;

      const note = await db.$transaction(async (tx) => {
        const created = await tx.note.create({
          data: {
            id: noteId,
            user_id: ctx.user.id,
            title: input.title,
            folder_id: input.folder_id ?? null,
            project_id: input.project_id ?? null,
            purpose: input.purpose,
            body_json: input.body_json ?? "{}",
            body_text: input.body_text ?? "",
            body_markdown: input.body_markdown ?? "",
            word_count: wordCount,
          },
        });
        return created;
      });

      try {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Note",
          entity_id: note.id,
          action: "note_created",
          meta: { purpose: note.purpose, folder_id: note.folder_id, project_id: note.project_id },
        });
      } catch {
        // Activity log failures must not prevent the note from being returned
      }

      if (input.body_json) {
        try {
          const refs = extractReferenceNodes(input.body_json);
          await syncLinksForSource({
            userId: ctx.user.id,
            source_type: "Note",
            source_id: note.id,
            resolved: refs,
          });
        } catch {
          // Link sync failures must not prevent the note from being returned
        }
      }

      return note;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(500).optional(),
        body_json: z.string().optional(),
        body_text: z.string().optional(),
        body_markdown: z.string().optional(),
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        purpose: z
          .enum(["note", "meeting_note", "project_brief", "reading_note"])
          .optional(),
        pinned: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.folder_id) {
        const folder = await db.notesFolder.findFirst({
          where: { id: input.folder_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      }
      if (input.project_id) {
        const project = await db.project.findFirst({
          where: { id: input.project_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const data: Prisma.NoteUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.body_json !== undefined) data.body_json = input.body_json;
      if (input.body_text !== undefined) {
        data.body_text = input.body_text;
        data.word_count = input.body_text.split(/\s+/).filter(Boolean).length;
      }
      if (input.body_markdown !== undefined) data.body_markdown = input.body_markdown;
      if (input.folder_id !== undefined) {
        data.folder = input.folder_id
          ? { connect: { id: input.folder_id } }
          : { disconnect: true };
      }
      if (input.project_id !== undefined) {
        data.project = input.project_id
          ? { connect: { id: input.project_id } }
          : { disconnect: true };
      }
      if (input.purpose !== undefined) data.purpose = input.purpose;
      if (input.pinned !== undefined) data.pinned = input.pinned;

      const updated = await db.note.update({ where: { id: input.id }, data });

      try {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Note",
          entity_id: input.id,
          action: "note_updated",
          meta: { fields: Object.keys(data) },
        });
      } catch (err) {
        log.warn({ err, note_id: input.id }, "Non-fatal: audit log failed for note update");
      }

      if (input.body_json !== undefined) {
        try {
          const refs = extractReferenceNodes(input.body_json);
          await syncLinksForSource({
            userId: ctx.user.id,
            source_type: "Note",
            source_id: input.id,
            resolved: refs,
          });
        } catch (err) {
          log.warn({ err, note_id: input.id }, "Non-fatal: link graph sync failed for note update");
        }
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, title: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.note.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: input.id,
        action: "note_deleted",
        meta: { title: existing.title },
      });
      return { ok: true };
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
        select: { id: true, title: true, deleted_at: true },
      });
      if (!existing || !existing.deleted_at) throw new TRPCError({ code: "NOT_FOUND" });
      await db.note.update({
        where: { id: input.id },
        data: { deleted_at: null },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: input.id,
        action: "note_restored",
        meta: { title: existing.title },
      });
      return { ok: true };
    }),

  designateBrief: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, project_id: true, title: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      if (!note.project_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Note must be attached to a project before marking as brief.",
        });
      }
      const existing = await db.note.findFirst({
        where: {
          project_id: note.project_id,
          is_project_brief: true,
          user_id: ctx.user.id,
          deleted_at: null,
          id: { not: input.id },
        },
        select: { id: true },
      });
      if (existing) {
        await db.note.update({
          where: { id: existing.id },
          data: { is_project_brief: false },
        });
      }
      await db.note.update({
        where: { id: input.id },
        data: { is_project_brief: true },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: input.id,
        action: "note_designated_brief",
        meta: { project_id: note.project_id },
      });
      return { ok: true };
    }),

  undesignateBrief: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, is_project_brief: true, project_id: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      await db.note.update({
        where: { id: input.id },
        data: { is_project_brief: false },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Note",
        entity_id: input.id,
        action: "note_undesignated_brief",
        meta: { project_id: note.project_id },
      });
      return { ok: true };
    }),

  backlinks: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const links = await db.link.findMany({
        where: {
          user_id: ctx.user.id,
          target_type: "Note",
          target_id: input.id,
        },
        select: {
          id: true,
          source_type: true,
          source_id: true,
          source_excerpt: true,
          relation: true,
        },
        orderBy: { created_at: "desc" },
      });

      const noteIds = links
        .filter((l) => l.source_type === "Note")
        .map((l) => l.source_id);
      const taskIds = links
        .filter((l) => l.source_type === "Task")
        .map((l) => l.source_id);

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
      }));
    }),

  counts: protectedProcedure.query(async ({ ctx }) => {
    const counts = await db.note.groupBy({
      by: ["purpose"],
      where: { user_id: ctx.user.id, deleted_at: null },
      _count: { id: true },
    });
    const result: Record<string, number> = {};
    for (const row of counts) {
      result[row.purpose] = row._count.id;
    }
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    return { ...result, total };
  }),

  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(50).default(15),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (!q) {
        return db.note.findMany({
          where: { user_id: ctx.user.id, deleted_at: null },
          orderBy: { updated_at: "desc" },
          take: input.limit,
          select: { id: true, title: true, body_text: true, purpose: true, updated_at: true },
        });
      }
      return db.note.findMany({
        where: {
          user_id: ctx.user.id,
          deleted_at: null,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body_text: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { updated_at: "desc" },
        take: input.limit,
        select: { id: true, title: true, body_text: true, purpose: true, updated_at: true },
      });
    }),
});

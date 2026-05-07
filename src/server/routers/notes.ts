import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { extractReferenceNodes } from "@/core/links/resolver";
import { syncLinksForSource } from "@/core/links/service";
import { createLogger } from "@/core/logging";
import { detectEmbedProvider, getOembedEndpoint } from "@/core/notes/embed-providers";

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
        tag_ids: z.array(z.string().uuid()).optional(),
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
        ...(input.tag_ids?.length
          ? {
              AND: input.tag_ids.map((tag_id) => ({
                tag_on_notes: { some: { tag_id } },
              })),
            }
          : {}),
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
          tag_on_notes: {
            select: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
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
        include: {
          tag_on_notes: {
            select: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
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

  resolveEmbed: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .query(async ({ input }) => {
      const detection = detectEmbedProvider(input.url);
      if (!detection) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL is not from a supported embed provider.",
        });
      }

      let title: string | null = null;
      let thumbnail_url: string | null = null;

      const oembedUrl = getOembedEndpoint(input.url);
      if (oembedUrl) {
        try {
          const res = await fetch(oembedUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            if (typeof data["title"] === "string") title = data["title"];
            if (typeof data["thumbnail_url"] === "string") thumbnail_url = data["thumbnail_url"];
          }
        } catch {
          log.warn({ url: input.url }, "oEmbed fetch failed — continuing without metadata");
        }
      }

      return {
        provider: detection.provider,
        embed_url: detection.embed_url,
        canonical_url: detection.canonical_url,
        title,
        thumbnail_url,
      };
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

  addTag: protectedProcedure
    .input(z.object({ note_id: z.string().uuid(), tag_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.note_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });

      const tag = await db.tag.findFirst({
        where: { id: input.tag_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, name: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });

      const existing = await db.tagOnNote.findUnique({
        where: { tag_id_note_id: { tag_id: input.tag_id, note_id: input.note_id } },
        select: { tag_id: true },
      });

      if (!existing) {
        await db.$transaction([
          db.tagOnNote.create({ data: { tag_id: input.tag_id, note_id: input.note_id } }),
          db.tag.update({ where: { id: input.tag_id }, data: { usage_count: { increment: 1 } } }),
        ]);
        try {
          await logActivity({
            user_id: ctx.user.id,
            entity_type: "Note",
            entity_id: input.note_id,
            action: "note_tag_added",
            meta: { tag_id: input.tag_id, tag_name: tag.name },
          });
        } catch (err) {
          log.warn({ err, note_id: input.note_id }, "Non-fatal: audit log failed for note addTag");
        }
      }

      return { ok: true };
    }),

  removeTag: protectedProcedure
    .input(z.object({ note_id: z.string().uuid(), tag_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.note_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });

      const tag = await db.tag.findFirst({
        where: { id: input.tag_id, user_id: ctx.user.id },
        select: { id: true, name: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });

      const existing = await db.tagOnNote.findUnique({
        where: { tag_id_note_id: { tag_id: input.tag_id, note_id: input.note_id } },
        select: { tag_id: true },
      });

      if (existing) {
        await db.$transaction([
          db.tagOnNote.delete({ where: { tag_id_note_id: { tag_id: input.tag_id, note_id: input.note_id } } }),
          db.tag.update({ where: { id: input.tag_id }, data: { usage_count: { decrement: 1 } } }),
        ]);
        try {
          await logActivity({
            user_id: ctx.user.id,
            entity_type: "Note",
            entity_id: input.note_id,
            action: "note_tag_removed",
            meta: { tag_id: input.tag_id, tag_name: tag.name },
          });
        } catch (err) {
          log.warn({ err, note_id: input.note_id }, "Non-fatal: audit log failed for note removeTag");
        }
      }

      return { ok: true };
    }),

  setTags: protectedProcedure
    .input(z.object({ note_id: z.string().uuid(), tag_ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.note.findFirst({
        where: { id: input.note_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.tag_ids.length > 0) {
        const owned = await db.tag.findMany({
          where: { id: { in: input.tag_ids }, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (owned.length !== input.tag_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown tag id" });
        }
      }

      await db.$transaction(async (tx) => {
        const existing = await tx.tagOnNote.findMany({
          where: { note_id: input.note_id },
          select: { tag_id: true },
        });
        const prev = new Set(existing.map((e) => e.tag_id));
        const next = new Set(input.tag_ids);

        const toAdd = input.tag_ids.filter((id) => !prev.has(id));
        const toRemove = [...prev].filter((id) => !next.has(id));

        if (toRemove.length > 0) {
          await tx.tagOnNote.deleteMany({
            where: { note_id: input.note_id, tag_id: { in: toRemove } },
          });
          await tx.tag.updateMany({
            where: { id: { in: toRemove } },
            data: { usage_count: { decrement: 1 } },
          });
        }

        if (toAdd.length > 0) {
          await tx.tagOnNote.createMany({
            data: toAdd.map((tag_id) => ({ tag_id, note_id: input.note_id })),
            skipDuplicates: true,
          });
          await tx.tag.updateMany({
            where: { id: { in: toAdd } },
            data: { usage_count: { increment: 1 } },
          });
        }

        for (const tag_id of toAdd) {
          try {
            await logActivity({
              user_id: ctx.user.id,
              entity_type: "Note",
              entity_id: input.note_id,
              action: "note_tag_added",
              meta: { tag_id },
            });
          } catch { /* non-fatal */ }
        }
        for (const tag_id of toRemove) {
          try {
            await logActivity({
              user_id: ctx.user.id,
              entity_type: "Note",
              entity_id: input.note_id,
              action: "note_tag_removed",
              meta: { tag_id },
            });
          } catch { /* non-fatal */ }
        }
      });

      return { ok: true };
    }),
});

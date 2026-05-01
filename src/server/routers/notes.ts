import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";

export const notesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
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
      const note = await db.note.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          title: input.title,
          folder_id: input.folder_id ?? null,
          project_id: input.project_id ?? null,
          purpose: input.purpose,
          body_json: input.body_json ?? "{}",
          body_text: input.body_text ?? "",
          body_markdown: input.body_markdown ?? "",
          word_count: input.body_text
            ? input.body_text.split(/\s+/).filter(Boolean).length
            : 0,
        },
      });
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

      return db.note.update({ where: { id: input.id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.note.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.note.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });
      return { ok: true };
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

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { complete } from "@/core/ai";
import { createLogger } from "@/core/logging";
import { z } from "zod";

const log = createLogger({ module: "capture-router" });

const CAPTURE_PARSE_SYSTEM_PROMPT = `You are Atlas, a productivity assistant. Given raw text from a user's capture, extract structured data.
Respond ONLY with valid JSON in this exact shape:
{
  "title": "concise title string (max 80 chars)",
  "tags": ["array", "of", "lowercase", "tag", "strings"],
  "due_date": "ISO 8601 date string or null",
  "action_items": ["array", "of", "action", "item", "strings"]
}
Do not include any other text or markdown fences.`;

interface ParsedCapture {
  title?: string;
  tags?: string[];
  due_date?: string | null;
  action_items?: string[];
}

function safeParseAiResponse(content: string): ParsedCapture | null {
  try {
    const json = JSON.parse(content.trim());
    const result: ParsedCapture = {};

    if (typeof json.title === "string" && json.title.length > 0) {
      result.title = json.title.slice(0, 80);
    }
    if (Array.isArray(json.tags)) {
      result.tags = (json.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length > 0);
    }
    if (typeof json.due_date === "string" && json.due_date.length > 0) {
      const parsed = new Date(json.due_date);
      if (!isNaN(parsed.getTime())) {
        result.due_date = json.due_date;
      }
    }
    if (Array.isArray(json.action_items)) {
      result.action_items = (json.action_items as unknown[]).filter(
        (a): a is string => typeof a === "string" && a.length > 0,
      );
    }

    return result;
  } catch {
    return null;
  }
}

export const captureRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        raw_text: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          raw_text: input.raw_text,
          tags: [],
          action_items: [],
        },
      });

      try {
        const result = await complete({
          task: "capture_parse",
          prompt: input.raw_text,
          userId: ctx.user.id,
          options: {
            systemPrompt: CAPTURE_PARSE_SYSTEM_PROMPT,
            maxTokens: 512,
          },
        });

        const parsed = safeParseAiResponse(result.content);

        if (parsed) {
          const updated = await db.capture.update({
            where: { id: capture.id },
            data: {
              title: parsed.title ?? null,
              tags: parsed.tags ?? [],
              due_date: parsed.due_date ? new Date(parsed.due_date) : null,
              action_items: parsed.action_items ?? [],
              ai_parsed: true,
            },
          });
          return updated;
        }
      } catch (err) {
        log.warn({ err, captureId: capture.id }, "AI parse failed; capture saved without enrichment");
      }

      return capture;
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const captures = await db.capture.findMany({
        where: {
          user_id: ctx.user.id,
          deleted_at: null,
          ...(input.cursor ? { id: { lt: input.cursor } } : {}),
        },
        orderBy: { id: "desc" },
        take: input.limit,
      });
      return captures;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: {
          id: input.id,
          user_id: ctx.user.id,
          deleted_at: null,
        },
      });
      if (!capture) throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });
      return capture;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.capture.updateMany({
        where: { id: input.id, user_id: ctx.user.id },
        data: { deleted_at: new Date() },
      });
      return { ok: true };
    }),
});

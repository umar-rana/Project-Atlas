import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import {
  PersonCreateSchema,
  PersonUpdateSchema,
  PersonEmailSchema,
  PersonPhoneSchema,
  PersonAddressSchema,
  PersonOrganizationSchema,
  PersonUrlSchema,
  PersonEventSchema,
  PersonRelationSchema,
  PersonSkillSchema,
  PersonInterestSchema,
  deriveDisplayName,
  normalizeUrl,
  detectUrlType,
} from "@/core/people/validation";

const log = createLogger({ module: "people-router" });

let parsePhoneNumber: ((number: string, region?: string) => { number: string } | undefined) | null = null;

async function tryNormalizePhone(number: string, locale?: string): Promise<string | null> {
  try {
    if (!parsePhoneNumber) {
      const mod = await import("libphonenumber-js");
      parsePhoneNumber = (n: string, r?: string) => {
        try {
          return mod.parsePhoneNumber(n, r as never);
        } catch {
          return undefined;
        }
      };
    }
    const region = locale
      ? (locale.split("-")[1]?.toUpperCase() ?? locale.split("_")[1]?.toUpperCase())
      : undefined;
    const parsed = parsePhoneNumber(number, region);
    return parsed ? parsed.number : null;
  } catch {
    return null;
  }
}

function generateHandle(displayName: string, userId: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
  return base || `person-${userId.slice(0, 8)}`;
}

async function ensureUniqueHandle(userId: string, base: string): Promise<string> {
  let handle = base;
  let suffix = 1;
  while (true) {
    const existing = await db.person.findFirst({
      where: { user_id: userId, handle, deleted_at: null },
      select: { id: true },
    });
    if (!existing) return handle;
    handle = `${base}-${suffix++}`;
  }
}

async function enforcePrimary(
  table: "personEmail" | "personPhone" | "personAddress" | "personOrganization",
  personId: string,
  newPrimaryId: string,
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
) {
  const modelMap = {
    personEmail: tx.personEmail,
    personPhone: tx.personPhone,
    personAddress: tx.personAddress,
    personOrganization: tx.personOrganization,
  } as Record<string, { updateMany: (args: unknown) => Promise<unknown> }>;

  const model = modelMap[table];
  if (!model) return;

  await model.updateMany({
    where: { person_id: personId, is_primary: true, id: { not: newPrimaryId }, deleted_at: null },
    data: { is_primary: false },
  });
}

// ─── Main people router ───────────────────────────────────────────────────────

export const peopleRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().max(500).optional(),
        relationship_type: z.string().max(100).optional(),
        tag_ids: z.array(z.string().uuid()).optional(),
        sort: z.enum(["name", "created_at", "updated_at", "last_contacted_at"]).default("name"),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        user_id: ctx.user.id,
        deleted_at: null as null,
        ...(input.search
          ? {
              OR: [
                { display_name: { contains: input.search, mode: "insensitive" as const } },
                { given_name: { contains: input.search, mode: "insensitive" as const } },
                { family_name: { contains: input.search, mode: "insensitive" as const } },
                { nickname: { contains: input.search, mode: "insensitive" as const } },
                { biography: { contains: input.search, mode: "insensitive" as const } },
                { emails: { some: { email: { contains: input.search, mode: "insensitive" as const }, deleted_at: null } } },
                { organizations: { some: { name: { contains: input.search, mode: "insensitive" as const }, deleted_at: null } } },
              ],
            }
          : {}),
        ...(input.relationship_type ? { relationship_type: input.relationship_type } : {}),
        ...(input.tag_ids?.length
          ? {
              AND: input.tag_ids.map((tag_id) => ({
                tags: { some: { tag_id } },
              })),
            }
          : {}),
      };

      const orderBy =
        input.sort === "name"
          ? [{ display_name: "asc" as const }, { family_name: "asc" as const }]
          : [{ [input.sort]: "desc" as const }];

      const people = await db.person.findMany({
        where,
        orderBy,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          handle: true,
          display_name: true,
          given_name: true,
          family_name: true,
          nickname: true,
          photo_url: true,
          relationship_type: true,
          created_at: true,
          updated_at: true,
          last_contacted_at: true,
          emails: {
            where: { is_primary: true, deleted_at: null },
            select: { email: true, type: true },
            take: 1,
          },
          phones: {
            where: { is_primary: true, deleted_at: null },
            select: { number: true, type: true },
            take: 1,
          },
          organizations: {
            where: { is_primary: true, is_current: true, deleted_at: null },
            select: { name: true, title: true },
            take: 1,
            orderBy: { is_primary: "desc" as const },
          },
          addresses: {
            where: { is_primary: true, deleted_at: null },
            select: { city: true, country_name: true, country_code: true },
            take: 1,
          },
          tags: {
            select: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
      });

      let nextCursor: string | undefined;
      if (people.length > input.limit) {
        nextCursor = people.pop()!.id;
      }

      return { people, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const person = await db.person.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        include: {
          emails: { where: { deleted_at: null }, orderBy: [{ is_primary: "desc" }, { created_at: "asc" }] },
          phones: { where: { deleted_at: null }, orderBy: [{ is_primary: "desc" }, { created_at: "asc" }] },
          addresses: { where: { deleted_at: null }, orderBy: [{ is_primary: "desc" }, { created_at: "asc" }] },
          organizations: { where: { deleted_at: null }, orderBy: [{ is_primary: "desc" }, { is_current: "desc" }, { created_at: "asc" }] },
          urls: { where: { deleted_at: null }, orderBy: { created_at: "asc" } },
          events: { where: { deleted_at: null }, orderBy: { date: "asc" } },
          relations: {
            where: { deleted_at: null },
            include: { related_person: { select: { id: true, display_name: true, given_name: true, family_name: true, photo_url: true, handle: true } } },
          },
          reverse_relations: {
            where: { deleted_at: null },
            include: { person: { select: { id: true, display_name: true, given_name: true, family_name: true, photo_url: true, handle: true } } },
          },
          skills: { where: { deleted_at: null }, orderBy: { name: "asc" } },
          interests: { where: { deleted_at: null }, orderBy: { name: "asc" } },
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        },
      });
      if (!person) throw new TRPCError({ code: "NOT_FOUND" });
      return person;
    }),

  create: protectedProcedure
    .input(PersonCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const displayName = deriveDisplayName({ ...input });
      const baseHandle = input.handle ?? generateHandle(displayName || "person", ctx.user.id);
      const handle = await ensureUniqueHandle(ctx.user.id, baseHandle);

      const person = await db.person.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          handle,
          display_name: input.display_name ?? displayName,
          honorific_prefix: input.honorific_prefix,
          given_name: input.given_name,
          middle_name: input.middle_name,
          family_name: input.family_name,
          honorific_suffix: input.honorific_suffix,
          nickname: input.nickname,
          biography: input.biography,
          photo_url: input.photo_url || undefined,
          relationship_type: input.relationship_type,
          cadence_days: input.cadence_days,
          next_follow_up_at: input.next_follow_up_at ? new Date(input.next_follow_up_at) : undefined,
          last_contacted_at: input.last_contacted_at ? new Date(input.last_contacted_at) : undefined,
          external_data: input.external_data !== undefined ? (input.external_data as Prisma.InputJsonValue) : undefined,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Person",
        entity_id: person.id,
        action: "create",
        meta: { handle },
      }).catch((err: unknown) => log.warn({ err }, "audit log failed"));

      return person;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(PersonUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await db.person.findFirst({
        where: { id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const person = await db.person.update({
        where: { id },
        data: {
          ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
          ...(data.honorific_prefix !== undefined ? { honorific_prefix: data.honorific_prefix } : {}),
          ...(data.given_name !== undefined ? { given_name: data.given_name } : {}),
          ...(data.middle_name !== undefined ? { middle_name: data.middle_name } : {}),
          ...(data.family_name !== undefined ? { family_name: data.family_name } : {}),
          ...(data.honorific_suffix !== undefined ? { honorific_suffix: data.honorific_suffix } : {}),
          ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
          ...(data.biography !== undefined ? { biography: data.biography } : {}),
          ...(data.photo_url !== undefined ? { photo_url: data.photo_url || null } : {}),
          ...(data.relationship_type !== undefined ? { relationship_type: data.relationship_type } : {}),
          ...(data.cadence_days !== undefined ? { cadence_days: data.cadence_days } : {}),
          ...(data.next_follow_up_at !== undefined ? { next_follow_up_at: data.next_follow_up_at ? new Date(data.next_follow_up_at) : null } : {}),
          ...(data.last_contacted_at !== undefined ? { last_contacted_at: data.last_contacted_at ? new Date(data.last_contacted_at) : null } : {}),
          ...(data.external_data !== undefined ? { external_data: data.external_data !== null ? (data.external_data as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Person",
        entity_id: id,
        action: "update",
        before: existing as Record<string, unknown>,
        after: person as Record<string, unknown>,
      }).catch((err: unknown) => log.warn({ err }, "audit log failed"));

      return person;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.person.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.person.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Person",
        entity_id: input.id,
        action: "delete",
      }).catch((err: unknown) => log.warn({ err }, "audit log failed"));

      return { ok: true };
    }),

  getRelationshipTypes: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.person.findMany({
      where: { user_id: ctx.user.id, deleted_at: null, relationship_type: { not: null } },
      select: { relationship_type: true },
    });
    const types = [...new Set(rows.map((r) => r.relationship_type).filter(Boolean) as string[])];
    return types;
  }),

  getSuggestedRelationshipTypes: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.person.findMany({
      where: { user_id: ctx.user.id, deleted_at: null, relationship_type: { not: null } },
      select: { relationship_type: true, updated_at: true },
      orderBy: { updated_at: "desc" },
      take: 100,
    });
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (r.relationship_type && !seen.has(r.relationship_type)) {
        seen.set(r.relationship_type, seen.size);
      }
    }
    return [...seen.keys()];
  }),

  // ─── Email sub-router ────────────────────────────────────────────────────────
  emails: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid() }).merge(PersonEmailSchema))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({
          where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });

        const id = newId();
        const row = await db.$transaction(async (tx) => {
          if (input.is_primary) {
            await tx.personEmail.updateMany({
              where: { person_id: input.person_id, is_primary: true, deleted_at: null },
              data: { is_primary: false },
            });
          }
          return tx.personEmail.create({
            data: { id, person_id: input.person_id, email: input.email, type: input.type, is_primary: input.is_primary, source: input.source, source_id: input.source_id },
          });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEmail", entity_id: id, action: "person_email_add", meta: { person_id: input.person_id } }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.string().uuid() }).merge(PersonEmailSchema.partial()))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personEmail.findFirst({
          where: { id, person: { user_id: ctx.user.id }, deleted_at: null },
          select: { id: true, person_id: true },
        });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const updated = await db.$transaction(async (tx) => {
          if (data.is_primary) {
            await tx.personEmail.updateMany({
              where: { person_id: row.person_id, is_primary: true, id: { not: id }, deleted_at: null },
              data: { is_primary: false },
            });
          }
          return tx.personEmail.update({ where: { id }, data });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEmail", entity_id: id, action: "person_email_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personEmail.findFirst({
          where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null },
          select: { id: true, person_id: true, is_primary: true },
        });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        await db.$transaction(async (tx) => {
          await tx.personEmail.update({ where: { id: input.id }, data: { deleted_at: new Date(), is_primary: false } });
          if (row.is_primary) {
            const next = await tx.personEmail.findFirst({
              where: { person_id: row.person_id, deleted_at: null, id: { not: input.id } },
              orderBy: { updated_at: "desc" },
            });
            if (next) await tx.personEmail.update({ where: { id: next.id }, data: { is_primary: true } });
          }
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEmail", entity_id: input.id, action: "person_email_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personEmail.findFirst({
          where: { id: input.id, person: { user_id: ctx.user.id } },
          select: { id: true },
        });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personEmail.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEmail", entity_id: input.id, action: "person_email_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── Phone sub-router ────────────────────────────────────────────────────────
  phones: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid() }).merge(PersonPhoneSchema))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({
          where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });

        const e164 = await tryNormalizePhone(input.number, ctx.user.locale_preset);
        const id = newId();

        const row = await db.$transaction(async (tx) => {
          if (input.is_primary) {
            await tx.personPhone.updateMany({
              where: { person_id: input.person_id, is_primary: true, deleted_at: null },
              data: { is_primary: false },
            });
          }
          return tx.personPhone.create({
            data: { id, person_id: input.person_id, number: input.number, e164_normalized: e164, type: input.type, is_primary: input.is_primary, source: input.source, source_id: input.source_id },
          });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonPhone", entity_id: id, action: "person_phone_add" }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.string().uuid() }).merge(PersonPhoneSchema.partial()))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personPhone.findFirst({
          where: { id, person: { user_id: ctx.user.id }, deleted_at: null },
          select: { id: true, person_id: true },
        });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const e164 = data.number ? await tryNormalizePhone(data.number, ctx.user.locale_preset) : undefined;

        const updated = await db.$transaction(async (tx) => {
          if (data.is_primary) {
            await tx.personPhone.updateMany({
              where: { person_id: row.person_id, is_primary: true, id: { not: id }, deleted_at: null },
              data: { is_primary: false },
            });
          }
          return tx.personPhone.update({ where: { id }, data: { ...data, ...(e164 !== undefined ? { e164_normalized: e164 } : {}) } });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonPhone", entity_id: id, action: "person_phone_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personPhone.findFirst({
          where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null },
          select: { id: true, person_id: true, is_primary: true },
        });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        await db.$transaction(async (tx) => {
          await tx.personPhone.update({ where: { id: input.id }, data: { deleted_at: new Date(), is_primary: false } });
          if (row.is_primary) {
            const next = await tx.personPhone.findFirst({
              where: { person_id: row.person_id, deleted_at: null, id: { not: input.id } },
              orderBy: { updated_at: "desc" },
            });
            if (next) await tx.personPhone.update({ where: { id: next.id }, data: { is_primary: true } });
          }
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonPhone", entity_id: input.id, action: "person_phone_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personPhone.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personPhone.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonPhone", entity_id: input.id, action: "person_phone_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── Address sub-router ───────────────────────────────────────────────────────
  addresses: router({
    add: protectedProcedure
      .input(z.object({
        person_id: z.string().uuid(),
        type: z.string().max(50).default("other"),
        street: z.string().max(500).optional(),
        city: z.string().max(200).optional(),
        region: z.string().max(200).optional(),
        postal_code: z.string().max(20).optional(),
        country_code: z.string().length(2).regex(/^[A-Z]{2}$/).optional(),
        country_name: z.string().max(200).optional(),
        formatted: z.string().max(1000).optional(),
        is_primary: z.boolean().default(false),
        source: z.string().max(100).optional(),
        source_id: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        const id = newId();

        const row = await db.$transaction(async (tx) => {
          if (input.is_primary) {
            await tx.personAddress.updateMany({ where: { person_id: input.person_id, is_primary: true, deleted_at: null }, data: { is_primary: false } });
          }
          return tx.personAddress.create({ data: { id, person_id: input.person_id, type: input.type, street: input.street, city: input.city, region: input.region, postal_code: input.postal_code, country_code: input.country_code, country_name: input.country_name, formatted: input.formatted, is_primary: input.is_primary, source: input.source, source_id: input.source_id } });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonAddress", entity_id: id, action: "person_address_add" }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string().uuid(),
        type: z.string().max(50).optional(),
        street: z.string().max(500).optional(),
        city: z.string().max(200).optional(),
        region: z.string().max(200).optional(),
        postal_code: z.string().max(20).optional(),
        country_code: z.string().length(2).optional(),
        country_name: z.string().max(200).optional(),
        formatted: z.string().max(1000).optional(),
        is_primary: z.boolean().optional(),
        source: z.string().max(100).optional(),
        source_id: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personAddress.findFirst({ where: { id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true, person_id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const updated = await db.$transaction(async (tx) => {
          if (data.is_primary) {
            await tx.personAddress.updateMany({ where: { person_id: row.person_id, is_primary: true, id: { not: id }, deleted_at: null }, data: { is_primary: false } });
          }
          return tx.personAddress.update({ where: { id }, data });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonAddress", entity_id: id, action: "person_address_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personAddress.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true, person_id: true, is_primary: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        await db.$transaction(async (tx) => {
          await tx.personAddress.update({ where: { id: input.id }, data: { deleted_at: new Date(), is_primary: false } });
          if (row.is_primary) {
            const next = await tx.personAddress.findFirst({ where: { person_id: row.person_id, deleted_at: null, id: { not: input.id } }, orderBy: { updated_at: "desc" } });
            if (next) await tx.personAddress.update({ where: { id: next.id }, data: { is_primary: true } });
          }
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonAddress", entity_id: input.id, action: "person_address_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personAddress.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personAddress.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonAddress", entity_id: input.id, action: "person_address_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── Organizations sub-router ─────────────────────────────────────────────────
  organizations: router({
    add: protectedProcedure
      .input(z.object({
        person_id: z.string().uuid(),
        name: z.string().min(1).max(500),
        title: z.string().max(300).optional(),
        department: z.string().max(300).optional(),
        is_current: z.boolean().default(true),
        is_primary: z.boolean().default(false),
        start_date: z.string().datetime().optional(),
        end_date: z.string().datetime().optional(),
        source: z.string().max(100).optional(),
        source_id: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        const id = newId();

        const row = await db.$transaction(async (tx) => {
          if (input.is_primary) {
            await tx.personOrganization.updateMany({ where: { person_id: input.person_id, is_primary: true, deleted_at: null }, data: { is_primary: false } });
          }
          return tx.personOrganization.create({ data: { id, person_id: input.person_id, name: input.name, title: input.title, department: input.department, is_current: input.is_current, is_primary: input.is_primary, start_date: input.start_date ? new Date(input.start_date) : undefined, end_date: (!input.is_current && input.end_date) ? new Date(input.end_date) : undefined, source: input.source, source_id: input.source_id } });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonOrganization", entity_id: id, action: "person_organization_add" }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(500).optional(),
        title: z.string().max(300).optional(),
        department: z.string().max(300).optional(),
        is_current: z.boolean().optional(),
        is_primary: z.boolean().optional(),
        start_date: z.string().datetime().optional(),
        end_date: z.string().datetime().optional(),
        source: z.string().max(100).optional(),
        source_id: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personOrganization.findFirst({ where: { id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true, person_id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const updated = await db.$transaction(async (tx) => {
          if (data.is_primary) {
            await tx.personOrganization.updateMany({ where: { person_id: row.person_id, is_primary: true, id: { not: id }, deleted_at: null }, data: { is_primary: false } });
          }
          return tx.personOrganization.update({ where: { id }, data: { ...data, start_date: data.start_date ? new Date(data.start_date) : undefined, end_date: data.is_current ? null : (data.end_date ? new Date(data.end_date) : undefined) } });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonOrganization", entity_id: id, action: "person_organization_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personOrganization.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true, person_id: true, is_primary: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        await db.$transaction(async (tx) => {
          await tx.personOrganization.update({ where: { id: input.id }, data: { deleted_at: new Date(), is_primary: false } });
          if (row.is_primary) {
            const next = await tx.personOrganization.findFirst({ where: { person_id: row.person_id, deleted_at: null, id: { not: input.id } }, orderBy: { updated_at: "desc" } });
            if (next) await tx.personOrganization.update({ where: { id: next.id }, data: { is_primary: true } });
          }
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonOrganization", entity_id: input.id, action: "person_organization_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personOrganization.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personOrganization.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonOrganization", entity_id: input.id, action: "person_organization_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── URLs sub-router ─────────────────────────────────────────────────────────
  urls: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid() }).merge(PersonUrlSchema))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });

        const normalizedUrl = normalizeUrl(input.url);
        const type = input.type === "other" ? detectUrlType(normalizedUrl) : input.type;
        const id = newId();

        const row = await db.personUrl.create({ data: { id, person_id: input.person_id, url: normalizedUrl, type, label: input.label, source: input.source, source_id: input.source_id } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonUrl", entity_id: id, action: "person_url_add" }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.string().uuid() }).merge(PersonUrlSchema.partial()))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personUrl.findFirst({ where: { id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const normalizedUrl = data.url ? normalizeUrl(data.url) : undefined;
        const type = normalizedUrl && (!data.type || data.type === "other") ? detectUrlType(normalizedUrl) : data.type;

        const updated = await db.personUrl.update({ where: { id }, data: { ...data, ...(normalizedUrl ? { url: normalizedUrl } : {}), ...(type ? { type } : {}) } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonUrl", entity_id: id, action: "person_url_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personUrl.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personUrl.update({ where: { id: input.id }, data: { deleted_at: new Date() } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonUrl", entity_id: input.id, action: "person_url_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personUrl.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personUrl.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonUrl", entity_id: input.id, action: "person_url_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── Events sub-router ───────────────────────────────────────────────────────
  events: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid() }).merge(PersonEventSchema))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        const id = newId();

        await db.$transaction(async (tx) => {
          if (input.type === "birthday") {
            await tx.personEvent.updateMany({ where: { person_id: input.person_id, type: "birthday", deleted_at: null }, data: { deleted_at: new Date() } });
          }
          return tx.personEvent.create({ data: { id, person_id: input.person_id, type: input.type, date: new Date(input.date), label: input.label, source: input.source, source_id: input.source_id } });
        });

        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEvent", entity_id: id, action: "person_event_add" }).catch(() => {});
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.string().uuid() }).merge(PersonEventSchema.partial()))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personEvent.findFirst({ where: { id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const updated = await db.personEvent.update({ where: { id }, data: { ...data, ...(data.date ? { date: new Date(data.date) } : {}) } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEvent", entity_id: id, action: "person_event_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personEvent.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personEvent.update({ where: { id: input.id }, data: { deleted_at: new Date() } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEvent", entity_id: input.id, action: "person_event_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personEvent.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personEvent.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonEvent", entity_id: input.id, action: "person_event_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── Relations sub-router ─────────────────────────────────────────────────────
  relations: router({
    add: protectedProcedure
      .input(z.object({
        person_id: z.string().uuid(),
        related_person_id: z.string().uuid().optional(),
        related_text: z.string().max(300).optional(),
        type: z.string().max(50).default("other"),
        source: z.string().max(100).optional(),
        source_id: z.string().max(200).optional(),
      }).refine((d) => d.related_person_id || d.related_text, { message: "Either related_person_id or related_text is required" }))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.related_person_id) {
          const rp = await db.person.findFirst({ where: { id: input.related_person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
          if (!rp) throw new TRPCError({ code: "NOT_FOUND" });
        }
        const id = newId();
        const row = await db.personRelation.create({ data: { id, person_id: input.person_id, related_person_id: input.related_person_id, related_text: input.related_text, type: input.type, source: input.source, source_id: input.source_id } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonRelation", entity_id: id, action: "person_relation_add" }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string().uuid(),
        related_person_id: z.string().uuid().optional(),
        related_text: z.string().max(300).optional(),
        type: z.string().max(50).optional(),
        source: z.string().max(100).optional(),
        source_id: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const row = await db.personRelation.findFirst({ where: { id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.related_person_id) {
          const rp = await db.person.findFirst({ where: { id: input.related_person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
          if (!rp) throw new TRPCError({ code: "NOT_FOUND" });
        }
        const updated = await db.personRelation.update({ where: { id }, data });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonRelation", entity_id: id, action: "person_relation_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personRelation.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personRelation.update({ where: { id: input.id }, data: { deleted_at: new Date() } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonRelation", entity_id: input.id, action: "person_relation_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personRelation.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personRelation.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonRelation", entity_id: input.id, action: "person_relation_restore" }).catch(() => {});
        return { ok: true };
      }),
  }),

  // ─── Skills sub-router ────────────────────────────────────────────────────────
  skills: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid() }).merge(PersonSkillSchema))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        const id = newId();
        const row = await db.personSkill.create({ data: { id, person_id: input.person_id, name: input.name } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonSkill", entity_id: id, action: "person_skill_add" }).catch(() => {});
        return row;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personSkill.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personSkill.update({ where: { id: input.id }, data: { deleted_at: new Date() } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonSkill", entity_id: input.id, action: "person_skill_remove" }).catch(() => {});
        return { ok: true };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personSkill.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const updated = await db.personSkill.update({ where: { id: input.id }, data: { name: input.name } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonSkill", entity_id: input.id, action: "person_skill_update" }).catch(() => {});
        return updated;
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personSkill.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personSkill.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonSkill", entity_id: input.id, action: "person_skill_restore" }).catch(() => {});
        return { ok: true };
      }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db.personSkill.findMany({
        where: { person: { user_id: ctx.user.id }, deleted_at: null },
        select: { name: true },
        distinct: ["name"],
        orderBy: { name: "asc" },
      });
      return rows.map((r) => r.name);
    }),
  }),

  // ─── Interests sub-router ─────────────────────────────────────────────────────
  interests: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid() }).merge(PersonInterestSchema))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        const id = newId();
        const row = await db.personInterest.create({ data: { id, person_id: input.person_id, name: input.name } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonInterest", entity_id: id, action: "person_interest_add" }).catch(() => {});
        return row;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personInterest.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const updated = await db.personInterest.update({ where: { id: input.id }, data: { name: input.name } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonInterest", entity_id: input.id, action: "person_interest_update" }).catch(() => {});
        return updated;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personInterest.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id }, deleted_at: null }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personInterest.update({ where: { id: input.id }, data: { deleted_at: new Date() } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonInterest", entity_id: input.id, action: "person_interest_remove" }).catch(() => {});
        return { ok: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const row = await db.personInterest.findFirst({ where: { id: input.id, person: { user_id: ctx.user.id } }, select: { id: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await db.personInterest.update({ where: { id: input.id }, data: { deleted_at: null } });
        await logActivity({ user_id: ctx.user.id, entity_type: "PersonInterest", entity_id: input.id, action: "person_interest_restore" }).catch(() => {});
        return { ok: true };
      }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db.personInterest.findMany({
        where: { person: { user_id: ctx.user.id }, deleted_at: null },
        select: { name: true },
        distinct: ["name"],
        orderBy: { name: "asc" },
      });
      return rows.map((r) => r.name);
    }),
  }),

  // ─── Tags sub-router ──────────────────────────────────────────────────────────
  tags: router({
    add: protectedProcedure
      .input(z.object({ person_id: z.string().uuid(), tag_id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });
        const tag = await db.tag.findFirst({ where: { id: input.tag_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!tag) throw new TRPCError({ code: "NOT_FOUND" });

        try {
          await db.tagOnPerson.create({ data: { person_id: input.person_id, tag_id: input.tag_id } });
          await db.tag.update({ where: { id: input.tag_id }, data: { usage_count: { increment: 1 } } });
        } catch {
          // Already exists — ignore
        }
        return { ok: true };
      }),

    remove: protectedProcedure
      .input(z.object({ person_id: z.string().uuid(), tag_id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });

        const existing = await db.tagOnPerson.findUnique({ where: { person_id_tag_id: { person_id: input.person_id, tag_id: input.tag_id } } });
        if (existing) {
          await db.tagOnPerson.delete({ where: { person_id_tag_id: { person_id: input.person_id, tag_id: input.tag_id } } });
          await db.tag.update({ where: { id: input.tag_id }, data: { usage_count: { decrement: 1 } } }).catch(() => {});
        }
        return { ok: true };
      }),

    set: protectedProcedure
      .input(z.object({ person_id: z.string().uuid(), tag_ids: z.array(z.string().uuid()) }))
      .mutation(async ({ ctx, input }) => {
        const person = await db.person.findFirst({ where: { id: input.person_id, user_id: ctx.user.id, deleted_at: null }, select: { id: true } });
        if (!person) throw new TRPCError({ code: "NOT_FOUND" });

        // Security: verify every requested tag belongs to this user
        if (input.tag_ids.length > 0) {
          const ownedTags = await db.tag.findMany({
            where: { id: { in: input.tag_ids }, user_id: ctx.user.id, deleted_at: null },
            select: { id: true },
          });
          const ownedIds = new Set(ownedTags.map((t) => t.id));
          const unauthorized = input.tag_ids.filter((id) => !ownedIds.has(id));
          if (unauthorized.length > 0) throw new TRPCError({ code: "FORBIDDEN", message: "One or more tag_ids do not belong to the current user" });
        }

        const current = await db.tagOnPerson.findMany({ where: { person_id: input.person_id } });
        const currentIds = new Set(current.map((r) => r.tag_id));
        const newIds = new Set(input.tag_ids);

        const toAdd = input.tag_ids.filter((id) => !currentIds.has(id));
        const toRemove = current.filter((r) => !newIds.has(r.tag_id)).map((r) => r.tag_id);

        await db.$transaction([
          ...toAdd.map((tag_id) => db.tagOnPerson.create({ data: { person_id: input.person_id, tag_id } })),
          ...toRemove.map((tag_id) => db.tagOnPerson.delete({ where: { person_id_tag_id: { person_id: input.person_id, tag_id } } })),
          ...toAdd.map((tag_id) => db.tag.update({ where: { id: tag_id }, data: { usage_count: { increment: 1 } } })),
          ...toRemove.map((tag_id) => db.tag.update({ where: { id: tag_id }, data: { usage_count: { decrement: 1 } } })),
        ]);

        return { ok: true };
      }),
  }),

  // ─── Person search (for @ mention picker) ─────────────────────────────────────
  search: protectedProcedure
    .input(z.object({ query: z.string().max(500), limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const people = await db.person.findMany({
        where: {
          user_id: ctx.user.id,
          deleted_at: null,
          ...(q
            ? {
                OR: [
                  { display_name: { contains: q, mode: "insensitive" } },
                  { given_name: { contains: q, mode: "insensitive" } },
                  { family_name: { contains: q, mode: "insensitive" } },
                  { handle: { contains: q, mode: "insensitive" } },
                  { nickname: { contains: q, mode: "insensitive" } },
                  { emails: { some: { email: { contains: q, mode: "insensitive" }, deleted_at: null } } },
                ],
              }
            : {}),
        },
        orderBy: { updated_at: "desc" },
        take: input.limit,
        select: {
          id: true,
          handle: true,
          display_name: true,
          given_name: true,
          family_name: true,
          nickname: true,
          photo_url: true,
          emails: { where: { is_primary: true, deleted_at: null }, select: { email: true }, take: 1 },
          organizations: { where: { is_current: true, deleted_at: null }, select: { name: true, title: true }, take: 1, orderBy: { is_primary: "desc" } },
        },
      });
      return people;
    }),
});

import type { Prisma } from "@prisma/client";
import { db, newId } from "@/core/db";
import { parseReferences } from "./parser";

type Tx = Prisma.TransactionClient | typeof db;

export interface ResolvedReferences {
  person_ids: string[];
  tag_ids: string[];
  entity_refs: { kind: string; id: string; label: string }[];
}

/**
 * Resolve parsed references to entity IDs (creating tags as needed) and
 * adjust usage_count based on the diff against the previously stored set.
 *
 * - Tags: looked up case-insensitively by name (scoped to user); auto-created
 *   on first use.
 * - People: looked up by handle (scoped to user). Wave 3a returns no real
 *   matches because the People module ships in Wave 6 — handles that don't
 *   resolve are silently dropped.
 * - Entities: resolved to Project or Task by title (case-insensitive). The
 *   resolved ref includes the kind so backlinks can be rendered.
 */
export async function resolveAndApplyReferences(opts: {
  userId: string;
  notes: string | null | undefined;
  previousTagIds: string[];
  tx?: Tx;
}): Promise<ResolvedReferences> {
  const tx = opts.tx ?? db;
  const parsed = parseReferences(opts.notes);

  // ── Tags ───────────────────────────────────────────────────────────────
  const tag_ids: string[] = [];
  for (const name of parsed.tags) {
    const lower = name.toLowerCase();
    const existing = await tx.tag.findFirst({
      where: { user_id: opts.userId, name: lower, deleted_at: null },
    });
    if (existing) {
      tag_ids.push(existing.id);
    } else {
      const created = await tx.tag.create({
        data: {
          id: newId(),
          user_id: opts.userId,
          name: lower,
          usage_count: 0,
        },
      });
      tag_ids.push(created.id);
    }
  }

  // Diff usage_count: tags in new set but not previous → +1; previous but not
  // new → -1.
  const prevSet = new Set(opts.previousTagIds);
  const newSet = new Set(tag_ids);
  const incremented: string[] = [];
  const decremented: string[] = [];
  for (const id of newSet) if (!prevSet.has(id)) incremented.push(id);
  for (const id of prevSet) if (!newSet.has(id)) decremented.push(id);

  if (incremented.length > 0) {
    await tx.tag.updateMany({
      where: { id: { in: incremented } },
      data: { usage_count: { increment: 1 } },
    });
  }
  if (decremented.length > 0) {
    await tx.tag.updateMany({
      where: { id: { in: decremented } },
      data: { usage_count: { decrement: 1 } },
    });
  }

  // ── People ─────────────────────────────────────────────────────────────
  // Wave 6 will populate Person; for now, look up by handle and accept
  // whatever matches. Unresolved handles are dropped (correct per spec).
  let person_ids: string[] = [];
  if (parsed.people.length > 0) {
    const matches = await tx.person.findMany({
      where: {
        user_id: opts.userId,
        handle: { in: parsed.people },
        deleted_at: null,
      },
      select: { id: true },
    });
    person_ids = matches.map((m) => m.id);
  }

  // ── Entities ───────────────────────────────────────────────────────────
  const entity_refs: ResolvedReferences["entity_refs"] = [];
  if (parsed.entities.length > 0) {
    const projects = await tx.project.findMany({
      where: {
        user_id: opts.userId,
        title: { in: parsed.entities, mode: "insensitive" },
        deleted_at: null,
      },
      select: { id: true, title: true },
    });
    const tasks = await tx.task.findMany({
      where: {
        user_id: opts.userId,
        title: { in: parsed.entities, mode: "insensitive" },
        deleted_at: null,
      },
      select: { id: true, title: true },
    });
    const seen = new Set<string>();
    for (const p of projects) {
      const key = `project:${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entity_refs.push({ kind: "project", id: p.id, label: p.title });
    }
    for (const t of tasks) {
      const key = `task:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entity_refs.push({ kind: "task", id: t.id, label: t.title });
    }
  }

  return { person_ids, tag_ids, entity_refs };
}

/**
 * Decrement usage_count for the given tag IDs (used on task delete).
 */
export async function releaseTagReferences(opts: { tagIds: string[]; tx?: Tx }): Promise<void> {
  if (opts.tagIds.length === 0) return;
  const tx = opts.tx ?? db;
  await tx.tag.updateMany({
    where: { id: { in: opts.tagIds } },
    data: { usage_count: { decrement: 1 } },
  });
}

/**
 * One-time backfill: populate Link rows from existing task reference data.
 *
 * Scans all Task rows that have referenced_entity_refs or referenced_tag_ids
 * stored from the Wave 3a resolver, converts them to Link rows, and upserts.
 *
 * Safe to run multiple times — the sync uses the unique constraint
 * (source_type, source_id, target_type, target_id) with skipDuplicates.
 *
 * Run with:
 *   npx tsx src/scripts/backfill-links.ts
 */

import { db } from "@/core/db";
import { syncLinksForSource } from "@/core/links/service";
import type { ResolvedLink } from "@/core/links/resolver";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "backfill-links" });

const BATCH_SIZE = 100;

async function backfillTaskLinks(): Promise<void> {
  log.info("Starting link backfill for tasks...");

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalLinksCreated = 0;

  while (true) {
    const tasks = await db.task.findMany({
      where: {
        deleted_at: null,
      },
      select: {
        id: true,
        user_id: true,
        referenced_entity_refs: true,
        referenced_tag_ids: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (tasks.length === 0) break;

    for (const task of tasks) {
      const entity_refs = (task.referenced_entity_refs as Array<{
        kind: string;
        id: string;
        label: string;
      }> | null) ?? [];

      const resolvedLinks: ResolvedLink[] = [
        ...entity_refs.map((e) => ({
          target_type: e.kind === "project" ? "Project" : "Task",
          target_id: e.id,
        })),
        ...(task.referenced_tag_ids ?? []).map((id: string) => ({
          target_type: "Tag",
          target_id: id,
        })),
      ];

      if (resolvedLinks.length > 0) {
        const before = await db.link.count({
          where: { source_type: "Task", source_id: task.id },
        });

        await syncLinksForSource({
          userId: task.user_id,
          source_type: "Task",
          source_id: task.id,
          resolved: resolvedLinks,
        });

        const after = await db.link.count({
          where: { source_type: "Task", source_id: task.id },
        });

        totalLinksCreated += after - before;
      }

      totalProcessed++;
    }

    log.info({ processed: totalProcessed }, "Backfill progress");
    const lastTask = tasks[tasks.length - 1];
    cursor = lastTask?.id;

    if (tasks.length < BATCH_SIZE) break;
  }

  log.info({ totalProcessed, totalLinksCreated }, "Link backfill complete");
}

async function backfillNoteLinks(): Promise<void> {
  log.info("Starting link backfill for notes...");

  const { extractReferenceNodes } = await import("@/core/links/resolver");

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalLinksCreated = 0;

  while (true) {
    const notes = await db.note.findMany({
      where: { deleted_at: null },
      select: { id: true, user_id: true, body_json: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (notes.length === 0) break;

    for (const note of notes) {
      if (!note.body_json || note.body_json === "{}") {
        totalProcessed++;
        continue;
      }

      const refs = extractReferenceNodes(note.body_json);
      if (refs.length > 0) {
        const before = await db.link.count({
          where: { source_type: "Note", source_id: note.id },
        });

        await syncLinksForSource({
          userId: note.user_id,
          source_type: "Note",
          source_id: note.id,
          resolved: refs,
        });

        const after = await db.link.count({
          where: { source_type: "Note", source_id: note.id },
        });

        totalLinksCreated += after - before;
      }

      totalProcessed++;
    }

    log.info({ processed: totalProcessed }, "Note backfill progress");
    const lastNote = notes[notes.length - 1];
    cursor = lastNote?.id;

    if (notes.length < BATCH_SIZE) break;
  }

  log.info({ totalProcessed, totalLinksCreated }, "Note link backfill complete");
}

async function main(): Promise<void> {
  try {
    await backfillTaskLinks();
    await backfillNoteLinks();
    log.info("All backfills complete");
  } catch (err) {
    log.error({ err }, "Backfill failed");
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

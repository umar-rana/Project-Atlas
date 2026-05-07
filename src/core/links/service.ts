import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { Prisma } from "@prisma/client";
import type { ResolvedLink } from "./resolver";

type Tx = Prisma.TransactionClient | typeof db;

const log = createLogger({ module: "links-service" });

/**
 * Sync Link rows for a given source (note or task).
 *
 * Diffs the current Link rows for this source against the new resolved
 * references list, inserts new rows, and deletes removed rows.
 * Emits audit log entries for link_created and link_removed events.
 *
 * Safe to call multiple times (upsert pattern via unique constraint).
 */
export async function syncLinksForSource(opts: {
  userId: string;
  source_type: "Note" | "Task";
  source_id: string;
  resolved: ResolvedLink[];
  tx?: Tx;
}): Promise<void> {
  const client = opts.tx ?? db;

  const existing = await client.link.findMany({
    where: {
      user_id: opts.userId,
      source_type: opts.source_type,
      source_id: opts.source_id,
      relation: "reference",
    },
    select: { id: true, target_type: true, target_id: true },
  });

  const existingMap = new Map(existing.map((l) => [`${l.target_type}:${l.target_id}`, l.id]));

  const incomingSet = new Set(opts.resolved.map((r) => `${r.target_type}:${r.target_id}`));

  // Links to add: in incoming but not in existing
  const toAdd = opts.resolved.filter((r) => !existingMap.has(`${r.target_type}:${r.target_id}`));

  // Links to remove: in existing but not in incoming
  const toRemoveIds = existing
    .filter((l) => !incomingSet.has(`${l.target_type}:${l.target_id}`))
    .map((l) => l.id);

  if (toAdd.length > 0) {
    await client.link.createMany({
      data: toAdd.map((r) => ({
        id: newId(),
        user_id: opts.userId,
        source_type: opts.source_type,
        source_id: opts.source_id,
        target_type: r.target_type,
        target_id: r.target_id,
        relation: "reference",
      })),
      skipDuplicates: true,
    });

    // Emit audit entries for added links
    await emitLinkAuditEntries(
      client,
      opts.userId,
      toAdd,
      opts.source_type,
      opts.source_id,
      "link_created",
    );
  }

  if (toRemoveIds.length > 0) {
    // Capture removed link targets for audit before deleting
    const toRemoveLinks = existing.filter((l) => toRemoveIds.includes(l.id));

    await client.link.deleteMany({
      where: { id: { in: toRemoveIds } },
    });

    await emitLinkAuditEntries(
      client,
      opts.userId,
      toRemoveLinks.map((l) => ({ target_type: l.target_type, target_id: l.target_id })),
      opts.source_type,
      opts.source_id,
      "link_removed",
    );
  }
}

async function emitLinkAuditEntries(
  client: Tx,
  userId: string,
  links: ResolvedLink[],
  source_type: string,
  source_id: string,
  action: "link_created" | "link_removed",
): Promise<void> {
  if (links.length === 0) return;
  try {
    await client.auditLog.createMany({
      data: links.map((l) => ({
        id: newId(),
        user_id: userId,
        entity_type: "Link",
        entity_id: source_id,
        action,
        meta: {
          source_type,
          source_id,
          target_type: l.target_type,
          target_id: l.target_id,
        } as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    log.error({ err, action, source_type, source_id }, "Failed to write link audit entries");
  }
}

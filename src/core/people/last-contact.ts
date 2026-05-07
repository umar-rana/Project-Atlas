import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "people.last-contact" });

/**
 * Recomputes last_contacted_at as MAX(occurred_at) across non-deleted
 * PersonInteraction rows for the given person.
 * Returns null when no interactions exist.
 */
export async function recomputeLastContactAt(personId: string): Promise<Date | null> {
  const result = await db.personInteraction.aggregate({
    where: { person_id: personId, deleted_at: null },
    _max: { occurred_at: true },
  });
  return result._max.occurred_at ?? null;
}

/**
 * Recomputes last_contacted_at and next_follow_up_at for the given person and
 * persists both in a single DB write.
 *
 * Rules:
 *   - last_contacted_at = MAX(occurred_at) from non-deleted interactions
 *     (null if no interactions)
 *   - next_follow_up_at = last_contacted_at + cadence_days days
 *     (null if either is null)
 *
 * NOTE: This function must never be called from capture/task/email processing
 * pipelines. It is only called from PersonInteraction CRUD and cadence updates.
 */
export async function recomputeAndPersist(personId: string): Promise<void> {
  try {
    const person = await db.person.findFirst({
      where: { id: personId },
      select: { cadence_days: true },
    });

    if (!person) {
      log.warn({ person_id: personId }, "recomputeAndPersist: person not found");
      return;
    }

    const lastContactAt = await recomputeLastContactAt(personId);

    let nextFollowUpAt: Date | null = null;
    if (lastContactAt && person.cadence_days) {
      nextFollowUpAt = new Date(
        lastContactAt.getTime() + person.cadence_days * 24 * 60 * 60 * 1000,
      );
    }

    await db.person.update({
      where: { id: personId },
      data: {
        last_contacted_at: lastContactAt,
        next_follow_up_at: nextFollowUpAt,
      },
    });

    log.debug(
      { person_id: personId, last_contacted_at: lastContactAt, next_follow_up_at: nextFollowUpAt },
      "recomputed last_contacted_at and next_follow_up_at",
    );
  } catch (err) {
    log.error({ err, person_id: personId }, "recomputeAndPersist failed");
    throw err;
  }
}

/**
 * Recomputes only next_follow_up_at when cadence_days changes but
 * last_contacted_at remains valid (no interaction changes).
 */
export async function recomputeNextFollowUpAt(personId: string): Promise<void> {
  try {
    const person = await db.person.findFirst({
      where: { id: personId },
      select: { last_contacted_at: true, cadence_days: true },
    });

    if (!person) {
      log.warn({ person_id: personId }, "recomputeNextFollowUpAt: person not found");
      return;
    }

    let nextFollowUpAt: Date | null = null;
    if (person.last_contacted_at && person.cadence_days) {
      nextFollowUpAt = new Date(
        person.last_contacted_at.getTime() + person.cadence_days * 24 * 60 * 60 * 1000,
      );
    }

    await db.person.update({
      where: { id: personId },
      data: { next_follow_up_at: nextFollowUpAt },
    });
  } catch (err) {
    log.error({ err, person_id: personId }, "recomputeNextFollowUpAt failed");
    throw err;
  }
}

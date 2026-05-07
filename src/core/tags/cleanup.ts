import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "tags-cleanup" });

export interface TagCleanupCandidate {
  id: string;
  name: string;
  usage_count: number;
  created_at: Date;
}

export interface TagCleanupAnalysis {
  candidates: TagCleanupCandidate[];
  total_tags: number;
  analysed_at: Date;
}

/**
 * Identifies tags that are likely "accidental" creations from the old
 * auto-create-from-AI behaviour. A tag is a cleanup candidate if:
 *   - usage_count == 1 (only ever applied to one task)
 *   - updated_at is within 5 seconds of created_at (never manually edited)
 *   - not deleted
 *
 * This analysis is read-only. Nothing is deleted automatically.
 * The result is intended to surface candidates in the Tag management UI
 * (Phase 4) so the user can decide what to clean up.
 */
export async function analyseCleanupCandidates(userId: string): Promise<TagCleanupAnalysis> {
  try {
    const [candidates, total] = await Promise.all([
      db.tag.findMany({
        where: {
          user_id: userId,
          deleted_at: null,
          usage_count: 1,
        },
        select: {
          id: true,
          name: true,
          usage_count: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: "desc" },
        take: 200,
      }),
      db.tag.count({
        where: { user_id: userId, deleted_at: null },
      }),
    ]);

    // Filter to tags where updated_at is very close to created_at —
    // meaning the tag was never manually renamed, recoloured, or otherwise edited.
    const EDIT_THRESHOLD_MS = 5_000;
    const unedited = candidates.filter(
      (t) => Math.abs(t.updated_at.getTime() - t.created_at.getTime()) < EDIT_THRESHOLD_MS,
    );

    log.debug({ userId, total, candidateCount: unedited.length }, "Tag cleanup analysis complete");

    return {
      candidates: unedited.map((t) => ({
        id: t.id,
        name: t.name,
        usage_count: t.usage_count,
        created_at: t.created_at,
      })),
      total_tags: total,
      analysed_at: new Date(),
    };
  } catch (err) {
    log.error({ err, userId }, "Tag cleanup analysis failed");
    return {
      candidates: [],
      total_tags: 0,
      analysed_at: new Date(),
    };
  }
}

import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "conversion/conflict-resolver" });

export type ConflictResolution = "rename" | "replace" | "skip";

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingNoteId?: string;
  conflictingNoteTitle?: string;
  suggestedTitle?: string;
}

/**
 * Checks if a note with the given title already exists for the user (case-insensitive).
 */
export async function checkTitleConflict(params: {
  userId: string;
  title: string;
}): Promise<ConflictCheckResult> {
  const existing = await db.note.findFirst({
    where: {
      user_id: params.userId,
      deleted_at: null,
      title: {
        equals: params.title,
        mode: "insensitive",
      },
    },
    select: { id: true, title: true },
  });

  if (!existing) {
    return { hasConflict: false };
  }

  // Suggest a "(2)" suffix
  const suggestedTitle = `${params.title} (2)`;

  return {
    hasConflict: true,
    conflictingNoteId: existing.id,
    conflictingNoteTitle: existing.title,
    suggestedTitle,
  };
}

/**
 * Resolves a title conflict based on the chosen resolution.
 *
 * - "rename": Uses the new (suffixed) title
 * - "replace": Soft-deletes the existing note (moves to trash). Always scoped
 *              by userId to prevent IDOR — will throw if the note doesn't belong to the user.
 * - "skip": Returns null to indicate import should be skipped
 */
export async function resolveConflict(params: {
  userId: string;
  resolution: ConflictResolution;
  conflictingNoteId?: string;
  newTitle: string;
}): Promise<{ resolvedTitle: string | null }> {
  if (params.resolution === "skip") {
    log.info({ userId: params.userId }, "Import skipped due to title conflict");
    return { resolvedTitle: null };
  }

  if (params.resolution === "replace" && params.conflictingNoteId) {
    const updated = await db.note.updateMany({
      where: {
        id: params.conflictingNoteId,
        user_id: params.userId,
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });
    if (updated.count === 0) {
      throw new Error("Conflicting note not found or does not belong to you");
    }
    log.info({ noteId: params.conflictingNoteId }, "Existing note moved to trash for conflict resolution");
    return { resolvedTitle: params.newTitle };
  }

  // "rename" — use the new title as provided
  return { resolvedTitle: params.newTitle };
}

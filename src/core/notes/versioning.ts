import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "notes-versioning" });

const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;
const MAX_VERSIONS = 50;

export interface SnapshotBody {
  body_json: string;
  body_text: string;
  body_markdown: string;
}

export interface SnapshotOptions {
  changeSummary?: string;
  /**
   * When true, always creates a new version regardless of the debounce window.
   * Use this for user-initiated actions (manual save, restore).
   * When false (default), the debounce rule applies (same user within 5 min → overwrite).
   */
  manual?: boolean;
}

/**
 * createSnapshot — creates or overwrites a version snapshot for a note.
 *
 * Debounce rule (manual=false, default — auto-save path):
 *   If the latest version was created by the same user within the last 5 minutes,
 *   overwrite it in place (no version_number bump).
 *   Otherwise create a new version (version_number = latest + 1).
 *
 * Manual path (manual=true):
 *   Always creates a new version regardless of debounce window or summary presence.
 *
 * Retention cap:
 *   After creation, if the note has more than 50 versions, the oldest
 *   non-anchor version (version_number != 1) is deleted.
 *   Version number 1 is always preserved as the anchor.
 *
 * This function THROWS on failure. Callers on the auto-save path should
 * wrap with `void createSnapshot(...).catch(...)` so errors are non-fatal.
 * Callers on the manual / restore path should let the error propagate.
 */
export async function createSnapshot(
  noteId: string,
  userId: string,
  body: SnapshotBody,
  options: SnapshotOptions = {},
): Promise<void> {
  const { changeSummary, manual = false } = options;

  const latest = await db.noteVersion.findFirst({
    where: { note_id: noteId },
    orderBy: { version_number: "desc" },
    select: {
      id: true,
      version_number: true,
      created_by: true,
      created_at: true,
    },
  });

  const now = new Date();

  if (!manual && latest) {
    const ageMs = now.getTime() - new Date(latest.created_at).getTime();
    const sameUser = latest.created_by === userId;
    if (ageMs < DEBOUNCE_WINDOW_MS && sameUser) {
      await db.noteVersion.update({
        where: { id: latest.id },
        data: {
          body_json: body.body_json,
          body_text: body.body_text,
          body_markdown: body.body_markdown,
        },
      });
      log.debug(
        { note_id: noteId, version_number: latest.version_number },
        "note-version overwritten (debounce)",
      );
      return;
    }
  }

  const nextVersionNumber = latest ? latest.version_number + 1 : 1;

  await db.noteVersion.create({
    data: {
      id: newId(),
      note_id: noteId,
      version_number: nextVersionNumber,
      body_json: body.body_json,
      body_text: body.body_text,
      body_markdown: body.body_markdown,
      change_summary: changeSummary ?? null,
      created_by: userId,
    },
  });

  log.debug({ note_id: noteId, version_number: nextVersionNumber, manual }, "note-version created");

  await enforceRetentionCap(noteId);
}

async function enforceRetentionCap(noteId: string): Promise<void> {
  const count = await db.noteVersion.count({ where: { note_id: noteId } });
  if (count <= MAX_VERSIONS) return;

  const oldest = await db.noteVersion.findFirst({
    where: {
      note_id: noteId,
      version_number: { not: 1 },
    },
    orderBy: { version_number: "asc" },
    select: { id: true, version_number: true },
  });

  if (!oldest) return;

  await db.noteVersion.delete({ where: { id: oldest.id } });
  log.debug(
    { note_id: noteId, deleted_version: oldest.version_number },
    "note-version retention cap: deleted oldest non-anchor",
  );
}

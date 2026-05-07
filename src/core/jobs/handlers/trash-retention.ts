import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/trash-retention" });

const RETENTION_DAYS = 30;

export interface TrashRetentionResult {
  checklistItems: number;
  workLogs: number;
  tasks: number;
  projects: number;
  notes: number;
  notesFolders: number;
  projectFolders: number;
  captures: number;
  tags: number;
  contexts: number;
  attachments: number;
  tables: number;
  tableColumns: number;
  tableRows: number;
  tablesFolders: number;
  taskTemplates: number;
  errors: string[];
}

export async function handleTrashRetention(): Promise<TrashRetentionResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  log.info({ cutoff, retentionDays: RETENTION_DAYS }, "trash-retention: starting purge");

  const result: TrashRetentionResult = {
    checklistItems: 0,
    workLogs: 0,
    tasks: 0,
    projects: 0,
    notes: 0,
    notesFolders: 0,
    projectFolders: 0,
    captures: 0,
    tags: 0,
    contexts: 0,
    attachments: 0,
    tables: 0,
    tableColumns: 0,
    tableRows: 0,
    tablesFolders: 0,
    taskTemplates: 0,
    errors: [],
  };

  // 1. ChecklistItems (must run before Tasks since tasks cascade-delete these)
  try {
    const { count } = await db.checklistItem.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.checklistItems = count;
    log.debug({ count }, "trash-retention: purged checklist items");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge checklist items");
    result.errors.push(`checklistItems: ${msg}`);
  }

  // 2. TaskWorkLogs (must run before Tasks since tasks cascade-delete these)
  try {
    const { count } = await db.taskWorkLog.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.workLogs = count;
    log.debug({ count }, "trash-retention: purged work logs");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge work logs");
    result.errors.push(`workLogs: ${msg}`);
  }

  // 3. Tasks — Task.parent_id is a self-referential FK with onDelete: Cascade.
  //    Before hard-deleting, null out parent_id on any non-deleted subtasks
  //    whose parent is about to be purged (to avoid unintended cascade deletes).
  try {
    await db.task.updateMany({
      where: {
        deleted_at: null,
        parent: { deleted_at: { lt: cutoff, not: null } },
      },
      data: { parent_id: null },
    });
    const { count } = await db.task.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.tasks = count;
    log.debug({ count }, "trash-retention: purged tasks");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge tasks");
    result.errors.push(`tasks: ${msg}`);
  }

  // 4. Projects — FK references from Task, Note, Table, TaskTemplate are all
  //    onDelete: SetNull so the DB nulls them automatically.
  try {
    const { count } = await db.project.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.projects = count;
    log.debug({ count }, "trash-retention: purged projects");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge projects");
    result.errors.push(`projects: ${msg}`);
  }

  // 5. Notes — NoteVersion and TagOnNote both cascade.
  try {
    const { count } = await db.note.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.notes = count;
    log.debug({ count }, "trash-retention: purged notes");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge notes");
    result.errors.push(`notes: ${msg}`);
  }

  // 6. NotesFolders — parent_id is onDelete: SetNull (self-referential), Note.folder_id is SetNull.
  try {
    const { count } = await db.notesFolder.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.notesFolders = count;
    log.debug({ count }, "trash-retention: purged notes folders");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge notes folders");
    result.errors.push(`notesFolders: ${msg}`);
  }

  // 7. ProjectFolders — parent_id and Project.folder_id are both onDelete: SetNull.
  try {
    const { count } = await db.projectFolder.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.projectFolders = count;
    log.debug({ count }, "trash-retention: purged project folders");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge project folders");
    result.errors.push(`projectFolders: ${msg}`);
  }

  // 8. Captures — only non-processed; processed captures are handled by their own job.
  try {
    const { count } = await db.capture.deleteMany({
      where: {
        deleted_at: { lt: cutoff, not: null },
        state: { not: "processed" },
      },
    });
    result.captures = count;
    log.debug({ count }, "trash-retention: purged captures");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge captures");
    result.errors.push(`captures: ${msg}`);
  }

  // 9. Tags — all join tables (TagOnTask, TagOnAttachment, TagOnNote, TagOnTaskTemplate) cascade.
  try {
    const { count } = await db.tag.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.tags = count;
    log.debug({ count }, "trash-retention: purged tags");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge tags");
    result.errors.push(`tags: ${msg}`);
  }

  // 10. Contexts — join tables (ContextOnTask, ContextOnTaskTemplate) cascade.
  try {
    const { count } = await db.context.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.contexts = count;
    log.debug({ count }, "trash-retention: purged contexts");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge contexts");
    result.errors.push(`contexts: ${msg}`);
  }

  // 11. Attachments — TagOnAttachment cascades. Storage cleanup is handled by
  //     the attachment-cleanup job; here we only hard-delete the DB record.
  try {
    const { count } = await db.attachment.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.attachments = count;
    log.debug({ count }, "trash-retention: purged attachment records");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge attachments");
    result.errors.push(`attachments: ${msg}`);
  }

  // 12. TableColumns and TableRows (before Table since they cascade from Table)
  try {
    const { count } = await db.tableColumn.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.tableColumns = count;
    log.debug({ count }, "trash-retention: purged table columns");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge table columns");
    result.errors.push(`tableColumns: ${msg}`);
  }

  try {
    const { count } = await db.tableRow.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.tableRows = count;
    log.debug({ count }, "trash-retention: purged table rows");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge table rows");
    result.errors.push(`tableRows: ${msg}`);
  }

  // 13. Tables — TableColumn and TableRow cascade; project_id and folder_id are SetNull.
  try {
    const { count } = await db.table.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.tables = count;
    log.debug({ count }, "trash-retention: purged tables");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge tables");
    result.errors.push(`tables: ${msg}`);
  }

  // 14. TablesFolders — parent_id and Table.folder_id are onDelete: SetNull.
  try {
    const { count } = await db.tablesFolder.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.tablesFolders = count;
    log.debug({ count }, "trash-retention: purged tables folders");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge tables folders");
    result.errors.push(`tablesFolders: ${msg}`);
  }

  // 15. TaskTemplates — all join tables cascade; default_project_id is SetNull.
  try {
    const { count } = await db.taskTemplate.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } },
    });
    result.taskTemplates = count;
    log.debug({ count }, "trash-retention: purged task templates");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "trash-retention: failed to purge task templates");
    result.errors.push(`taskTemplates: ${msg}`);
  }

  const total =
    result.checklistItems +
    result.workLogs +
    result.tasks +
    result.projects +
    result.notes +
    result.notesFolders +
    result.projectFolders +
    result.captures +
    result.tags +
    result.contexts +
    result.attachments +
    result.tableColumns +
    result.tableRows +
    result.tables +
    result.tablesFolders +
    result.taskTemplates;

  log.info({ total, errors: result.errors.length }, "trash-retention: completed");
  return result;
}

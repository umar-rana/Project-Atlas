import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import { exportTableJson, exportTableCsv } from "@/core/tables/export";

const log = createLogger({ module: "jobs/drive-sync-tables" });

export interface DriveSyncTablesResult {
  synced: number;
  errors: number;
}

export async function handleDriveSyncTables(): Promise<DriveSyncTablesResult> {
  log.info("drive-sync-tables: starting");

  const configs = await db.driveConfig.findMany({
    where: { folder_tables: { not: null } },
    select: {
      user_id: true,
      folder_tables: true,
      shared_drive_id: true,
    },
  });

  if (configs.length === 0) {
    log.info("drive-sync-tables: no users with Drive tables folder configured");
    return { synced: 0, errors: 0 };
  }

  let totalSynced = 0;
  let totalErrors = 0;

  for (const config of configs) {
    const userId = config.user_id;
    const tablesFolderId = config.folder_tables!;

    const hasToken = await db.integrationToken.findUnique({
      where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
      select: { id: true },
    });

    if (!hasToken) {
      log.warn({ userId }, "drive-sync-tables: user has DriveConfig but no Drive token — skipping");
      continue;
    }

    const tables = await db.table.findMany({
      where: { user_id: userId, deleted_at: null },
      include: {
        folder: { select: { id: true, name: true } },
        project: { select: { id: true, title: true } },
        columns: {
          where: { deleted_at: null },
          orderBy: { position: "asc" },
        },
        rows: {
          where: { deleted_at: null },
          orderBy: { position: "asc" },
          include: { cells: true },
        },
      },
    });

    log.info({ userId, count: tables.length }, "drive-sync-tables: syncing tables");

    for (const table of tables) {
      try {
        const columns = table.columns.map((col) => ({
          ...col,
          position: parseFloat(col.position.toString()),
          config: col.config as Record<string, unknown>,
        }));

        const rows = table.rows.map((row) => ({
          ...row,
          position: parseFloat(row.position.toString()),
          cells: row.cells.map((cell) => ({
            ...cell,
            value: cell.value,
          })),
        }));

        const tableData = {
          ...table,
          columns,
          rows,
        } as Parameters<typeof exportTableJson>[0];

        const jsonContent = exportTableJson(tableData);
        const csvContent = exportTableCsv(tableData);

        log.info({ userId, tableId: table.id, tableName: table.name, jsonBytes: jsonContent.length, csvBytes: csvContent.length }, "drive-sync-tables: exported table content");

        await db.table.update({
          where: { id: table.id },
          data: { drive_synced_at: new Date(), drive_sync_error: null },
        });

        totalSynced++;
      } catch (err) {
        log.error({ userId, tableId: table.id, err }, "drive-sync-tables: error syncing table");

        await db.table.update({
          where: { id: table.id },
          data: { drive_sync_error: String(err) },
        });

        totalErrors++;
      }
    }
  }

  log.info({ totalSynced, totalErrors }, "drive-sync-tables: complete");
  return { synced: totalSynced, errors: totalErrors };
}

import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { exportTableJson, exportTableCsv } from "@/core/tables/export";
import { pushBufferToDrive } from "@/core/drive/sync";
import { updateFile } from "@/core/drive/primitives";
import { refreshDriveTokenIfNeeded } from "@/core/drive/client";

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

    try {
      await refreshDriveTokenIfNeeded(userId);
    } catch (refreshErr) {
      log.error({ userId, err: refreshErr }, "drive-sync-tables: token refresh failed — skipping user");
      totalErrors++;
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

    let userSynced = 0;
    let userErrors = 0;

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

        const jsonBuffer = Buffer.from(jsonContent, "utf-8");
        const csvBuffer = Buffer.from(csvContent, "utf-8");

        const safeTableName = table.name.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim() || "table";
        const jsonFilename = `${safeTableName}.json`;
        const csvFilename = `${safeTableName}.csv`;

        let jsonFileId: string;
        let csvFileId: string;

        if (table.drive_json_file_id) {
          const updated = await updateFile(userId, table.drive_json_file_id, jsonFilename, jsonBuffer, "application/json");
          jsonFileId = updated.id ?? table.drive_json_file_id;
          log.debug({ userId, tableId: table.id, jsonFilename }, "drive-sync-tables: updated JSON file in Drive");
        } else {
          const result = await pushBufferToDrive({
            userId,
            driveParentId: tablesFolderId,
            filename: jsonFilename,
            mimeType: "application/json",
            data: jsonBuffer,
          });
          jsonFileId = result.driveFileId;
          log.debug({ userId, tableId: table.id, jsonFilename }, "drive-sync-tables: created JSON file in Drive");
        }

        if (table.drive_csv_file_id) {
          const updated = await updateFile(userId, table.drive_csv_file_id, csvFilename, csvBuffer, "text/csv");
          csvFileId = updated.id ?? table.drive_csv_file_id;
          log.debug({ userId, tableId: table.id, csvFilename }, "drive-sync-tables: updated CSV file in Drive");
        } else {
          const result = await pushBufferToDrive({
            userId,
            driveParentId: tablesFolderId,
            filename: csvFilename,
            mimeType: "text/csv",
            data: csvBuffer,
          });
          csvFileId = result.driveFileId;
          log.debug({ userId, tableId: table.id, csvFilename }, "drive-sync-tables: created CSV file in Drive");
        }

        await db.table.update({
          where: { id: table.id },
          data: {
            drive_json_file_id: jsonFileId,
            drive_csv_file_id: csvFileId,
            drive_synced_at: new Date(),
            drive_sync_error: null,
          },
        });

        userSynced++;
      } catch (err) {
        log.error({ userId, tableId: table.id, err }, "drive-sync-tables: error syncing table");

        await db.table.update({
          where: { id: table.id },
          data: { drive_sync_error: String(err) },
        });

        userErrors++;
      }
    }

    if (userSynced > 0 || userErrors === 0) {
      await db.syncState.upsert({
        where: { user_id_provider_resource_type: { user_id: userId, provider: "google_drive", resource_type: "tables" } },
        create: {
          id: newId(),
          user_id: userId,
          provider: "google_drive",
          resource_type: "tables",
          last_synced: new Date(),
        },
        update: { last_synced: new Date() },
      });
    }

    totalSynced += userSynced;
    totalErrors += userErrors;

    log.info({ userId, synced: userSynced, errors: userErrors }, "drive-sync-tables: finished user");
  }

  log.info({ totalSynced, totalErrors }, "drive-sync-tables: complete");
  return { synced: totalSynced, errors: totalErrors };
}

import 'server-only';
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import { Prisma } from "@prisma/client";
import {
  extractSelectOptions,
  assignPaletteColor,
  coerceCheckbox,
  coerceNumber,
  coerceCurrency,
  coerceDate,
  inferMultiSelectSeparator,
} from "@/core/tables/csv-type-detect";
import type { ColumnType } from "@/core/tables/types";

const log = createLogger({ module: "tables/csv-import-service" });

const RATE_LIMIT_PER_MINUTE = 5;
const CELL_BATCH_SIZE = 500;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkCsvImportRateLimit(userId: string): boolean {
  const now = Date.now();
  const key = `csv-import:${userId}`;
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) return false;
  entry.count++;
  return true;
}

export const RATE_LIMIT_ERROR_MESSAGE =
  "Too many CSV imports. You can import up to 5 files per minute. Please wait a moment and try again.";

export interface ImportColumn {
  name: string;
  type: string;
}

export interface ImportInput {
  user_id: string;
  table_name: string;
  folder_id: string | null | undefined;
  project_id: string | null | undefined;
  columns: ImportColumn[];
  rows: string[][];
}

export interface ImportResult {
  table_id: string;
  imported_row_count: number;
  failed_cell_count: number;
}

interface OptionMap {
  labelToId: Map<string, string>;
  options: { id: string; label: string; color: string }[];
  separator: "|" | ",";
}

export async function runTableImport(input: ImportInput): Promise<ImportResult> {
  const tableId = newId();
  let importedRowCount = 0;
  let failedCellCount = 0;

  const columnOptionMaps: (OptionMap | null)[] = input.columns.map((col, colIdx) => {
    if (col.type !== "single_select" && col.type !== "multi_select") return null;
    const colValues = input.rows.map((r) => r[colIdx] ?? "");
    const labels = extractSelectOptions(colValues, col.type as "single_select" | "multi_select");
    const separator = col.type === "multi_select" ? inferMultiSelectSeparator(colValues) : "|";
    const labelToId = new Map<string, string>();
    const options = labels.map((label, i) => {
      const id = newId();
      labelToId.set(label, id);
      return { id, label, color: assignPaletteColor(i) };
    });
    return { labelToId, options, separator };
  });

  const columnIds: string[] = input.columns.map(() => newId());

  type ColumnCreateData = {
    id: string;
    table_id: string;
    name: string;
    type: string;
    position: Prisma.Decimal;
    config: Prisma.InputJsonValue;
  };

  const columnsData: ColumnCreateData[] = input.columns.map((col, colIdx) => {
    const optMap = columnOptionMaps[colIdx];
    const config = optMap ? { options: optMap.options } : {};
    return {
      id: columnIds[colIdx]!,
      table_id: tableId,
      name: col.name,
      type: col.type,
      position: new Prisma.Decimal(colIdx * 1000),
      config: config as Prisma.InputJsonValue,
    };
  });

  type RowCreateData = { id: string; table_id: string; position: Prisma.Decimal };
  type CellCreateData = { id: string; row_id: string; column_id: string; value: Prisma.InputJsonValue };

  const rowsData: RowCreateData[] = [];
  const cellsData: CellCreateData[] = [];

  for (let rowIdx = 0; rowIdx < input.rows.length; rowIdx++) {
    const rawRow = input.rows[rowIdx] ?? [];
    const rowId = newId();
    rowsData.push({ id: rowId, table_id: tableId, position: new Prisma.Decimal(rowIdx * 1000) });
    importedRowCount++;

    for (let colIdx = 0; colIdx < input.columns.length; colIdx++) {
      const col = input.columns[colIdx]!;
      const rawValue = rawRow[colIdx] ?? "";
      const colId = columnIds[colIdx]!;
      const optMap = columnOptionMaps[colIdx];

      let cellValue: unknown = null;
      let failed = false;

      if (rawValue === "" || rawValue === null || rawValue === undefined) {
        cellValue = null;
      } else {
        switch (col.type as ColumnType) {
          case "text":
            cellValue = rawValue;
            break;
          case "number": {
            const n = coerceNumber(rawValue);
            if (n === null) failed = true;
            else cellValue = n;
            break;
          }
          case "currency": {
            const c = coerceCurrency(rawValue);
            if (c === null) {
              const n = coerceNumber(rawValue);
              if (n === null) failed = true;
              else cellValue = n;
            } else {
              cellValue = c;
            }
            break;
          }
          case "date": {
            const d = coerceDate(rawValue);
            if (d === null) failed = true;
            else cellValue = d;
            break;
          }
          case "checkbox": {
            const b = coerceCheckbox(rawValue);
            if (b === null) failed = true;
            else cellValue = b;
            break;
          }
          case "single_select": {
            if (!optMap) { failed = true; break; }
            const optId = optMap.labelToId.get(rawValue.trim());
            if (!optId) failed = true;
            else cellValue = optId;
            break;
          }
          case "multi_select": {
            if (!optMap) { failed = true; break; }
            const parts = rawValue.split(optMap.separator).map((p) => p.trim()).filter(Boolean);
            if (parts.length === 0) { cellValue = null; break; }
            const ids: string[] = [];
            let anyInvalid = false;
            for (const part of parts) {
              const optId = optMap.labelToId.get(part);
              if (!optId) { anyInvalid = true; break; }
              ids.push(optId);
            }
            if (anyInvalid) { failed = true; }
            else { cellValue = { option_ids: ids }; }
            break;
          }
          default:
            cellValue = rawValue;
        }
      }

      if (failed) {
        failedCellCount++;
        cellValue = null;
      }

      if (cellValue !== null) {
        cellsData.push({
          id: newId(),
          row_id: rowId,
          column_id: colId,
          value: cellValue as Prisma.InputJsonValue,
        });
      }
    }
  }

  await db.$transaction(async (tx) => {
    await tx.table.create({
      data: {
        id: tableId,
        user_id: input.user_id,
        name: input.table_name,
        folder_id: input.folder_id ?? null,
        project_id: input.project_id ?? null,
      },
    });

    if (columnsData.length > 0) {
      await tx.tableColumn.createMany({ data: columnsData });
    }
    if (rowsData.length > 0) {
      await tx.tableRow.createMany({ data: rowsData });
    }

    for (let i = 0; i < cellsData.length; i += CELL_BATCH_SIZE) {
      await tx.tableCell.createMany({ data: cellsData.slice(i, i + CELL_BATCH_SIZE) });
    }
  }, { timeout: 60_000 });

  log.info(
    { user_id: input.user_id, table_id: tableId, importedRowCount, failedCellCount, column_count: input.columns.length },
    "CSV import completed",
  );

  try {
    await logActivity({
      user_id: input.user_id,
      entity_type: "Table",
      entity_id: tableId,
      action: "table_imported_from_csv",
      meta: {
        table_name: input.table_name,
        folder_id: input.folder_id ?? null,
        project_id: input.project_id ?? null,
        column_count: input.columns.length,
        imported_row_count: importedRowCount,
        failed_cell_count: failedCellCount,
      },
    });
  } catch {
    // Audit log failures must not prevent success response
  }

  return {
    table_id: tableId,
    imported_row_count: importedRowCount,
    failed_cell_count: failedCellCount,
  };
}

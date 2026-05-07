import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { validateCellValue } from "@/core/tables/validators";
import { injectFormulaVirtualCells, validateFormula } from "@/core/tables/formula";
import type { ColumnType } from "@/core/tables/types";
import type { TableCellData } from "@/core/tables/types";
import { createLogger } from "@/core/logging";
import {
  checkCsvImportRateLimit,
  RATE_LIMIT_ERROR_MESSAGE,
  runTableImport,
} from "@/core/tables/csv-import-service";

const log = createLogger({ module: "tables" });

const COLUMN_TYPES = ["text", "number", "date", "checkbox", "single_select", "currency", "multi_select", "formula"] as const;
const AGGREGATION_TYPES = ["sum", "average", "count", "min", "max", "checked_ratio", "none"] as const;


function toNumber(d: Prisma.Decimal | null): number {
  return d ? parseFloat(d.toString()) : 0;
}

export const tablesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TableWhereInput = {
        user_id: ctx.user.id,
        deleted_at: null,
        ...(input.folder_id !== undefined ? { folder_id: input.folder_id } : {}),
        ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
      };

      const tables = await db.table.findMany({
        where,
        orderBy: { updated_at: "desc" },
        take: input.limit,
        include: {
          folder: { select: { id: true, name: true } },
          project: { select: { id: true, title: true } },
          _count: { select: { rows: { where: { deleted_at: null } } } },
        },
      });

      return tables.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        folder_id: t.folder_id,
        folder_name: t.folder?.name ?? null,
        project_id: t.project_id,
        project_title: t.project?.title ?? null,
        row_count: t._count.rows,
        drive_synced_at: t.drive_synced_at,
        drive_sync_error: t.drive_sync_error,
        created_at: t.created_at,
        updated_at: t.updated_at,
      }));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const table = await db.table.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
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
            include: {
              cells: true,
            },
          },
        },
      });

      if (!table) throw new TRPCError({ code: "NOT_FOUND" });

      const columns = table.columns.map((col) => ({
        ...col,
        position: toNumber(col.position),
        config: col.config as Record<string, unknown>,
      }));

      const allCols = columns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type as ColumnType,
        position: c.position,
        config: c.config as Record<string, unknown>,
        aggregation: c.aggregation ?? null,
        width: c.width,
      }));

      const rows = table.rows.map((row) => {
        const regularCells = row.cells.map((cell) => ({
          id: cell.id,
          row_id: cell.row_id,
          column_id: cell.column_id,
          value: cell.value,
        }));

        // Evaluate formula columns in dependency order — formula-on-formula references resolved correctly
        const formulaCells = injectFormulaVirtualCells(
          row.id,
          regularCells as TableCellData[],
          allCols as import("@/core/tables/types").TableColumnData[],
        );

        return {
          ...row,
          position: toNumber(row.position),
          cells: [...regularCells, ...formulaCells],
        };
      });

      return {
        ...table,
        columns,
        rows,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(500),
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        description: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folder_id) {
        const folder = await db.tablesFolder.findFirst({
          where: { id: input.folder_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      }
      if (input.project_id) {
        const project = await db.project.findFirst({
          where: { id: input.project_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const tableId = newId();
      const columnId = newId();

      const table = await db.$transaction(async (tx) => {
        const created = await tx.table.create({
          data: {
            id: tableId,
            user_id: ctx.user.id,
            name: input.name,
            folder_id: input.folder_id ?? null,
            project_id: input.project_id ?? null,
            description: input.description ?? null,
            manual_row_order: [],
          },
        });

        await tx.tableColumn.create({
          data: {
            id: columnId,
            table_id: tableId,
            name: "Name",
            type: "text",
            position: new Prisma.Decimal(0),
            config: {},
          },
        });

        return created;
      });

      try {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Table",
          entity_id: table.id,
          action: "table_created",
          meta: { name: table.name, folder_id: table.folder_id, project_id: table.project_id },
        });
      } catch {
        // Activity log failures must not prevent the table from being returned
      }

      return table;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(500).optional(),
        description: z.string().max(2000).nullable().optional(),
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.table.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, name: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const data: Prisma.TableUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.folder_id !== undefined) {
        data.folder = input.folder_id ? { connect: { id: input.folder_id } } : { disconnect: true };
      }
      if (input.project_id !== undefined) {
        data.project = input.project_id ? { connect: { id: input.project_id } } : { disconnect: true };
      }

      const updated = await db.table.update({ where: { id: input.id }, data });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Table",
        entity_id: input.id,
        action: "table_updated",
        meta: { fields: Object.keys(data) },
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.table.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, name: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.table.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Table",
        entity_id: input.id,
        action: "table_deleted",
        meta: { name: existing.name },
      });

      return { ok: true };
    }),

  addColumn: protectedProcedure
    .input(
      z.object({
        table_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        type: z.enum(COLUMN_TYPES),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const table = await db.table.findFirst({
        where: { id: input.table_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND" });

      // Validate formula columns
      if (input.type === "formula") {
        const cfg = (input.config ?? {}) as { expression?: string; return_type?: string };
        const expression = cfg.expression ?? "";
        const returnType = cfg.return_type ?? "text";

        const tableColumns = await db.tableColumn.findMany({
          where: { table_id: input.table_id, deleted_at: null },
          select: { id: true, name: true, type: true, config: true },
        });

        const colsForValidation = tableColumns.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          config: (c.config ?? {}) as Record<string, unknown>,
        }));

        // Pass the new column's name as selfName so circular ref detection includes it
        const errors = validateFormula(expression, returnType, colsForValidation, undefined, input.name);
        if (errors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: errors.join(" "),
          });
        }
      }

      const maxCol = await db.tableColumn.aggregate({
        _max: { position: true },
        where: { table_id: input.table_id, deleted_at: null },
      });
      const nextPos = maxCol._max.position
        ? new Prisma.Decimal(maxCol._max.position).plus(1000)
        : new Prisma.Decimal(0);

      const column = await db.tableColumn.create({
        data: {
          id: newId(),
          table_id: input.table_id,
          name: input.name,
          type: input.type,
          position: nextPos,
          config: (input.config ?? {}) as Prisma.InputJsonValue,
        },
      });

      await db.table.update({ where: { id: input.table_id }, data: { updated_at: new Date() } });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Table",
        entity_id: input.table_id,
        action: "table_column_added",
        meta: { column_id: column.id, name: column.name, type: column.type },
      });

      return { ...column, position: toNumber(column.position) };
    }),

  updateColumn: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        config: z.record(z.unknown()).optional(),
        aggregation: z.enum(AGGREGATION_TYPES).nullable().optional(),
        width: z.number().int().min(60).max(800).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const column = await db.tableColumn.findFirst({
        where: { id: input.id, deleted_at: null },
        include: { table: { select: { user_id: true, id: true } } },
      });
      if (!column || column.table.user_id !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      // Validate formula config changes
      if (column.type === "formula" && input.config !== undefined) {
        const cfg = input.config as { expression?: string; return_type?: string };
        const expression = cfg.expression ?? (column.config as { expression?: string }).expression ?? "";
        const returnType = cfg.return_type ?? (column.config as { return_type?: string }).return_type ?? "text";

        const tableColumns = await db.tableColumn.findMany({
          where: { table_id: column.table.id, deleted_at: null },
          select: { id: true, name: true, type: true, config: true },
        });

        const colsForValidation = tableColumns.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          config: (c.config ?? {}) as Record<string, unknown>,
        }));

        const errors = validateFormula(expression, returnType, colsForValidation, input.id);
        if (errors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: errors.join(" "),
          });
        }
      }

      const data: Prisma.TableColumnUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.config !== undefined) data.config = input.config as Prisma.InputJsonValue;
      if (input.aggregation !== undefined) data.aggregation = input.aggregation;
      if (input.width !== undefined) data.width = input.width;

      const updated = await db.tableColumn.update({ where: { id: input.id }, data });
      await db.table.update({ where: { id: column.table.id }, data: { updated_at: new Date() } });

      return { ...updated, position: toNumber(updated.position) };
    }),

  reorderColumns: protectedProcedure
    .input(
      z.object({
        table_id: z.string().uuid(),
        column_id: z.string().uuid(),
        insert_after_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const table = await db.table.findFirst({
        where: { id: input.table_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND" });

      const columns = await db.tableColumn.findMany({
        where: { table_id: input.table_id, deleted_at: null },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });

      const others = columns.filter((c) => c.id !== input.column_id);
      let insertIdx = others.length;
      if (input.insert_after_id === null) {
        insertIdx = 0;
      } else {
        const afterIdx = others.findIndex((c) => c.id === input.insert_after_id);
        if (afterIdx >= 0) insertIdx = afterIdx + 1;
      }

      const ordered = [...others];
      const moving = columns.find((c) => c.id === input.column_id);
      if (moving) ordered.splice(insertIdx, 0, moving);

      const STEP = 1000;
      await db.$transaction(
        ordered.map((c, i) =>
          db.tableColumn.update({
            where: { id: c.id },
            data: { position: new Prisma.Decimal(i * STEP) },
          }),
        ),
      );

      await db.table.update({ where: { id: input.table_id }, data: { updated_at: new Date() } });
      return { ok: true };
    }),

  deleteColumn: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const column = await db.tableColumn.findFirst({
        where: { id: input.id, deleted_at: null },
        include: { table: { select: { user_id: true, id: true } } },
      });
      if (!column || column.table.user_id !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      await db.tableColumn.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });
      await db.table.update({ where: { id: column.table.id }, data: { updated_at: new Date() } });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Table",
        entity_id: column.table.id,
        action: "table_column_deleted",
        meta: { column_id: input.id, name: column.name },
      });

      return { ok: true };
    }),

  addRow: protectedProcedure
    .input(
      z.object({
        table_id: z.string().uuid(),
        insert_after_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const table = await db.table.findFirst({
        where: { id: input.table_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND" });

      let position: Prisma.Decimal;
      if (input.insert_after_id) {
        const afterRow = await db.tableRow.findFirst({
          where: { id: input.insert_after_id, table_id: input.table_id, deleted_at: null },
          select: { position: true },
        });
        if (afterRow) {
          const nextRow = await db.tableRow.findFirst({
            where: {
              table_id: input.table_id,
              deleted_at: null,
              position: { gt: afterRow.position },
            },
            orderBy: { position: "asc" },
            select: { position: true },
          });
          if (nextRow) {
            position = new Prisma.Decimal(afterRow.position).plus(new Prisma.Decimal(nextRow.position)).dividedBy(2);
          } else {
            position = new Prisma.Decimal(afterRow.position).plus(1000);
          }
        } else {
          const maxRow = await db.tableRow.aggregate({
            _max: { position: true },
            where: { table_id: input.table_id, deleted_at: null },
          });
          position = maxRow._max.position
            ? new Prisma.Decimal(maxRow._max.position).plus(1000)
            : new Prisma.Decimal(0);
        }
      } else {
        const maxRow = await db.tableRow.aggregate({
          _max: { position: true },
          where: { table_id: input.table_id, deleted_at: null },
        });
        position = maxRow._max.position
          ? new Prisma.Decimal(maxRow._max.position).plus(1000)
          : new Prisma.Decimal(0);
      }

      const row = await db.tableRow.create({
        data: {
          id: newId(),
          table_id: input.table_id,
          position,
        },
      });

      await db.table.update({ where: { id: input.table_id }, data: { updated_at: new Date() } });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Table",
        entity_id: input.table_id,
        action: "table_row_added",
        meta: { row_id: row.id },
      });

      return { ...row, position: toNumber(row.position), cells: [] };
    }),

  deleteRow: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.tableRow.findFirst({
        where: { id: input.id, deleted_at: null },
        include: { table: { select: { user_id: true, id: true } } },
      });
      if (!row || row.table.user_id !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      await db.tableRow.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });
      await db.table.update({ where: { id: row.table.id }, data: { updated_at: new Date() } });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Table",
        entity_id: row.table.id,
        action: "table_row_deleted",
        meta: { row_id: input.id },
      });

      return { ok: true };
    }),

  reorderRows: protectedProcedure
    .input(
      z.object({
        table_id: z.string().uuid(),
        row_id: z.string().uuid(),
        insert_after_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const table = await db.table.findFirst({
        where: { id: input.table_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND" });

      const rows = await db.tableRow.findMany({
        where: { table_id: input.table_id, deleted_at: null },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });

      const others = rows.filter((r) => r.id !== input.row_id);
      let insertIdx = others.length;
      if (input.insert_after_id === null) {
        insertIdx = 0;
      } else {
        const afterIdx = others.findIndex((r) => r.id === input.insert_after_id);
        if (afterIdx >= 0) insertIdx = afterIdx + 1;
      }

      const ordered = [...others];
      const moving = rows.find((r) => r.id === input.row_id);
      if (moving) ordered.splice(insertIdx, 0, moving);

      const STEP = 1000;
      await db.$transaction(
        ordered.map((r, i) =>
          db.tableRow.update({
            where: { id: r.id },
            data: { position: new Prisma.Decimal(i * STEP) },
          }),
        ),
      );

      await db.table.update({ where: { id: input.table_id }, data: { updated_at: new Date() } });
      return { ok: true };
    }),

  upsertCell: protectedProcedure
    .input(
      z.object({
        row_id: z.string().uuid(),
        column_id: z.string().uuid(),
        value: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.tableRow.findFirst({
        where: { id: input.row_id, deleted_at: null },
        include: { table: { select: { user_id: true, id: true } } },
      });
      if (!row || row.table.user_id !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const column = await db.tableColumn.findFirst({
        where: { id: input.column_id, table_id: row.table.id, deleted_at: null },
        select: { id: true, type: true },
      });
      if (!column) throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });

      // Formula columns are read-only
      if (column.type === "formula") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formula columns are read-only and cannot be edited directly." });
      }

      const validation = validateCellValue(column.type as ColumnType, input.value);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.error ?? "Invalid cell value" });
      }

      const cell = await db.tableCell.upsert({
        where: { row_id_column_id: { row_id: input.row_id, column_id: input.column_id } },
        create: {
          id: newId(),
          row_id: input.row_id,
          column_id: input.column_id,
          value: validation.normalized as Prisma.InputJsonValue ?? Prisma.JsonNull,
        },
        update: {
          value: validation.normalized as Prisma.InputJsonValue ?? Prisma.JsonNull,
        },
      });

      await db.table.update({ where: { id: row.table.id }, data: { updated_at: new Date() } });
      return cell;
    }),

  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(50).default(15),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (!q) {
        return db.table.findMany({
          where: { user_id: ctx.user.id, deleted_at: null },
          orderBy: { updated_at: "desc" },
          take: input.limit,
          select: { id: true, name: true, description: true, updated_at: true },
        });
      }
      return db.table.findMany({
        where: {
          user_id: ctx.user.id,
          deleted_at: null,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { updated_at: "desc" },
        take: input.limit,
        select: { id: true, name: true, description: true, updated_at: true },
      });
    }),

  importFromCsv: protectedProcedure
    .input(
      z.object({
        table_name: z.string().min(1).max(500),
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        columns: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              type: z.enum(COLUMN_TYPES),
            }),
          )
          .min(1)
          .max(50),
        rows: z.array(z.array(z.string())).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!checkCsvImportRateLimit(ctx.user.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: RATE_LIMIT_ERROR_MESSAGE });
      }

      if (input.rows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The CSV file has no data rows." });
      }

      if (input.folder_id) {
        const folder = await db.tablesFolder.findFirst({
          where: { id: input.folder_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      }
      if (input.project_id) {
        const project = await db.project.findFirst({
          where: { id: input.project_id, user_id: ctx.user.id, deleted_at: null },
          select: { id: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return runTableImport({
        user_id: ctx.user.id,
        table_name: input.table_name,
        folder_id: input.folder_id,
        project_id: input.project_id,
        columns: input.columns,
        rows: input.rows,
      });
    }),
});

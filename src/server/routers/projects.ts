import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { normalizeProjectType, validateProjectType } from "@/core/projects/type-validation";
import { injectFormulaVirtualCells } from "@/core/tables/formula";
import type { TableColumnData, TableCellData, AggregationType, ColumnType } from "@/core/tables/types";
import { isFormulaError } from "@/core/tables/formula-shared";

const PROJECT_STATUS = z.enum(["active", "on_hold", "completed", "dropped"]);
const PROJECT_TYPE_STRING = z
  .string()
  .min(1)
  .max(32)
  .transform((v) => normalizeProjectType(v))
  .refine((v) => validateProjectType(v).valid, {
    message: "Invalid project type: only letters, numbers, spaces, and hyphens allowed",
  });

const TRACKER_AGGREGATION = z.enum(["sum", "average", "count", "min", "max", "checked_ratio"]);

function getCompatibleAggregations(
  columnType: ColumnType,
  columnConfig?: Record<string, unknown>,
): AggregationType[] {
  switch (columnType) {
    case "number":
    case "currency":
      return ["sum", "average", "count", "min", "max"];
    case "date":
      return ["count", "min", "max"];
    case "checkbox":
      return ["count", "checked_ratio"];
    case "formula": {
      const returnType = (columnConfig as { return_type?: string } | undefined)?.return_type;
      return returnType === "number"
        ? ["sum", "average", "count", "min", "max"]
        : ["count"];
    }
    default:
      return ["count"];
  }
}

function isAggregationCompatible(
  columnType: ColumnType,
  aggregation: string,
  columnConfig?: Record<string, unknown>,
): boolean {
  return (getCompatibleAggregations(columnType, columnConfig) as string[]).includes(aggregation);
}

function computeTrackerValue(
  columnType: ColumnType,
  aggregation: string,
  values: unknown[],
): number | null {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "" && !isFormulaError(v));

  if (nonNull.length === 0 && aggregation !== "count") return null;

  switch (aggregation) {
    case "count":
      return nonNull.length;

    case "sum": {
      if (columnType !== "number" && columnType !== "currency" && columnType !== "formula") return null;
      return nonNull.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
    }

    case "average": {
      if (columnType !== "number" && columnType !== "currency" && columnType !== "formula") return null;
      if (nonNull.length === 0) return null;
      const total = nonNull.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
      return total / nonNull.length;
    }

    case "min": {
      if (columnType === "number" || columnType === "currency" || columnType === "formula") {
        return Math.min(...nonNull.map((v) => Number(v)));
      }
      if (columnType === "date") {
        const timestamps = nonNull
          .map((v) => new Date(String(v)).getTime())
          .filter((t) => !isNaN(t));
        return timestamps.length === 0 ? null : Math.min(...timestamps);
      }
      return null;
    }

    case "max": {
      if (columnType === "number" || columnType === "currency" || columnType === "formula") {
        return Math.max(...nonNull.map((v) => Number(v)));
      }
      if (columnType === "date") {
        const timestamps = nonNull
          .map((v) => new Date(String(v)).getTime())
          .filter((t) => !isNaN(t));
        return timestamps.length === 0 ? null : Math.max(...timestamps);
      }
      return null;
    }

    case "checked_ratio": {
      if (columnType !== "checkbox") return null;
      if (values.length === 0) return 0;
      const checked = nonNull.filter((v) => v === true).length;
      return checked / values.length;
    }

    default:
      return null;
  }
}

async function computeProjectTracker(project: {
  user_id: string;
  tracker_table_id: string | null;
  tracker_column_id: string | null;
  tracker_aggregation: string | null;
  tracker_target_value: number | null;
  tracker_target_label: string | null;
}) {
  if (!project.tracker_table_id || !project.tracker_column_id || !project.tracker_aggregation) {
    return null;
  }

  const table = await db.table.findFirst({
    where: { id: project.tracker_table_id, user_id: project.user_id, deleted_at: null },
    select: { id: true, name: true },
  });

  if (!table) {
    return {
      table_id: project.tracker_table_id,
      column_id: project.tracker_column_id,
      table_name: null,
      column_name: null,
      aggregation: project.tracker_aggregation,
      current_value: null,
      target_value: project.tracker_target_value,
      target_label: project.tracker_target_label,
      percentage: null,
      status: "unavailable" as const,
    };
  }

  const column = await db.tableColumn.findFirst({
    where: { id: project.tracker_column_id, table_id: table.id, deleted_at: null },
  });

  if (!column) {
    return {
      table_id: project.tracker_table_id,
      column_id: project.tracker_column_id,
      table_name: table.name,
      column_name: null,
      aggregation: project.tracker_aggregation,
      current_value: null,
      target_value: project.tracker_target_value,
      target_label: project.tracker_target_label,
      percentage: null,
      status: "unavailable" as const,
    };
  }

  const allColumns = await db.tableColumn.findMany({
    where: { table_id: table.id, deleted_at: null },
    orderBy: { position: "asc" },
  });

  const rows = await db.tableRow.findMany({
    where: { table_id: table.id, deleted_at: null },
    include: { cells: true },
    orderBy: { position: "asc" },
  });

  const allColumnData: TableColumnData[] = allColumns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as ColumnType,
    position: Number(c.position),
    config: (c.config ?? {}) as TableColumnData["config"],
    aggregation: (c.aggregation ?? null) as AggregationType | null,
    width: c.width,
  }));

  let values: unknown[];

  if (column.type === "formula") {
    values = rows.map((row) => {
      const regularCells: TableCellData[] = row.cells.map((cell) => ({
        row_id: cell.row_id,
        column_id: cell.column_id,
        value: cell.value as TableCellData["value"],
      }));
      const formulaCells = injectFormulaVirtualCells(row.id, regularCells, allColumnData);
      const formulaCell = formulaCells.find((fc) => fc.column_id === column.id);
      return formulaCell?.value ?? null;
    });
  } else {
    values = rows.map((row) => {
      const cell = row.cells.find((c) => c.column_id === column.id);
      return cell?.value ?? null;
    });
  }

  const currentValue = computeTrackerValue(column.type as ColumnType, project.tracker_aggregation, values);

  let percentage: number | null = null;
  if (currentValue !== null && project.tracker_target_value != null && project.tracker_target_value !== 0) {
    percentage = (currentValue / project.tracker_target_value) * 100;
  }

  return {
    table_id: table.id,
    column_id: column.id,
    table_name: table.name,
    column_name: column.name,
    column_type: column.type,
    aggregation: project.tracker_aggregation,
    current_value: currentValue,
    target_value: project.tracker_target_value,
    target_label: project.tracker_target_label,
    percentage,
    status: "ok" as const,
  };
}

export const projectsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: PROJECT_STATUS.optional(),
          folder_id: z.string().uuid().nullable().optional(),
          include_all_statuses: z.boolean().optional(),
          type: z.string().optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ProjectWhereInput = {
        user_id: ctx.user.id,
        deleted_at: null,
      };

      if (!input.include_all_statuses) {
        if (input.status) {
          where.status = input.status;
        }
      }

      if (input.folder_id !== undefined) {
        where.folder_id = input.folder_id;
      }

      if (input.type) {
        where.type = normalizeProjectType(input.type);
      }

      const projects = await db.project.findMany({
        where,
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
      });

      // Get task counts per project (active only).
      const counts = await db.task.groupBy({
        by: ["project_id"],
        where: {
          user_id: ctx.user.id,
          status: "active",
          project_id: { in: projects.map((p) => p.id) },
          deleted_at: null,
        },
        _count: { _all: true },
      });
      const countMap = new Map(counts.map((c) => [c.project_id, c._count._all]));

      return projects.map((p) => ({
        ...p,
        task_count: countMap.get(p.id) ?? 0,
      }));
    }),

  distinctTypes: protectedProcedure.query(async ({ ctx }) => {
    const result = await db.project.groupBy({
      by: ["type"],
      where: {
        user_id: ctx.user.id,
        deleted_at: null,
      },
      _count: { _all: true },
    });
    return result
      .map((r) => ({ type: r.type, count: r._count._all }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }),

  typeConfigs: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUnique({
      where: { id: ctx.user.id },
      select: { tasks_prefs: true },
    });
    const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
    const configs = (prefs.type_configs ?? {}) as Record<string, { icon?: string; color?: string }>;
    return configs;
  }),

  setTypeConfig: protectedProcedure
    .input(
      z.object({
        type: z.string().min(1).max(32),
        icon: z.string().max(10).nullable().optional(),
        color: z.string().max(20).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { tasks_prefs: true },
      });
      const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
      const configs = { ...((prefs.type_configs ?? {}) as Record<string, { icon?: string; color?: string }>) };

      const entry: { icon?: string; color?: string } = configs[input.type] ?? {};
      if (input.icon !== undefined) {
        if (input.icon === null) {
          delete entry.icon;
        } else {
          entry.icon = input.icon;
        }
      }
      if (input.color !== undefined) {
        if (input.color === null) {
          delete entry.color;
        } else {
          entry.color = input.color;
        }
      }
      if (!entry.icon && !entry.color) {
        delete configs[input.type];
      } else {
        configs[input.type] = entry;
      }

      await db.user.update({
        where: { id: ctx.user.id },
        data: {
          tasks_prefs: { ...prefs, type_configs: configs } as Prisma.InputJsonValue,
        },
      });
      return { ok: true };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const now = new Date();
      const [activeTasks, totalTasks, completedTasks, lastActivity] = await Promise.all([
        db.task.count({
          where: {
            project_id: project.id,
            user_id: ctx.user.id,
            status: "active",
            parent_id: null,
            deleted_at: null,
            OR: [{ defer_date: null }, { defer_date: { lte: now } }],
          },
        }),
        db.task.count({
          where: { project_id: project.id, user_id: ctx.user.id, deleted_at: null, parent_id: null },
        }),
        db.task.count({
          where: { project_id: project.id, user_id: ctx.user.id, status: "completed", deleted_at: null, parent_id: null },
        }),
        db.task.findFirst({
          where: { project_id: project.id, user_id: ctx.user.id, deleted_at: null },
          orderBy: { updated_at: "desc" },
          select: { updated_at: true },
        }),
      ]);

      const metrics = {
        task_counts: {
          total: totalTasks,
          active: activeTasks,
          completed: completedTasks,
        },
        days_to_target: project.target_date
          ? Math.round((project.target_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : undefined,
        last_activity_at: lastActivity?.updated_at ?? null,
      };

      const tracker = await computeProjectTracker(project);

      return {
        ...project,
        task_count: activeTasks,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        metrics,
        tracker,
      };
    }),

  setTracker: protectedProcedure
    .input(
      z.object({
        project_id: z.string().uuid(),
        table_id: z.string().uuid(),
        column_id: z.string().uuid(),
        aggregation: TRACKER_AGGREGATION,
        target_value: z.number().nullable().optional(),
        target_label: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.project_id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const table = await db.table.findFirst({
        where: { id: input.table_id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });

      const column = await db.tableColumn.findFirst({
        where: { id: input.column_id, table_id: table.id, deleted_at: null },
      });
      if (!column) throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });

      if (!isAggregationCompatible(column.type as ColumnType, input.aggregation, column.config as Record<string, unknown>)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Aggregation "${input.aggregation}" is not compatible with column type "${column.type}"`,
        });
      }

      const hadTracker = !!project.tracker_table_id;

      await db.project.update({
        where: { id: project.id },
        data: {
          tracker_table_id: input.table_id,
          tracker_column_id: input.column_id,
          tracker_aggregation: input.aggregation,
          tracker_target_value: input.target_value ?? null,
          tracker_target_label: input.target_label ?? null,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: project.id,
        action: hadTracker ? "project_tracker_changed" : "project_tracker_set",
        meta: {
          table_id: input.table_id,
          table_name: table.name,
          column_id: input.column_id,
          column_name: column.name,
          aggregation: input.aggregation,
          target_value: input.target_value ?? null,
          target_label: input.target_label ?? null,
        },
      });

      return { ok: true };
    }),

  clearTracker: protectedProcedure
    .input(z.object({ project_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.project_id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      await db.project.update({
        where: { id: project.id },
        data: {
          tracker_table_id: null,
          tracker_column_id: null,
          tracker_aggregation: null,
          tracker_target_value: null,
          tracker_target_label: null,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: project.id,
        action: "project_tracker_cleared",
      });

      return { ok: true };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        notes: z.string().max(10_000).optional(),
        color: z.string().max(40).optional(),
        sequential: z.boolean().optional(),
        status: PROJECT_STATUS.optional(),
        type: PROJECT_TYPE_STRING.optional(),
        target_date: z.string().datetime({ offset: true }).nullable().optional(),
        folder_id: z.string().uuid().nullable().optional(),
        review_interval_days: z.number().int().nullable().optional(),
        parent_project_id: z.undefined({
          errorMap: () => ({ message: "Projects cannot be nested inside other projects. Use folders to organise projects." }),
        }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folder_id) {
        const folder = await db.projectFolder.findFirst({
          where: { id: input.folder_id, user_id: ctx.user.id, deleted_at: null },
        });
        if (!folder) throw new TRPCError({ code: "FORBIDDEN", message: "Folder not found" });
      }

      const [maxAgg, userRow] = await Promise.all([
        db.project.aggregate({
          _max: { position: true },
          where: { user_id: ctx.user.id },
        }),
        db.user.findUnique({
          where: { id: ctx.user.id },
          select: { tasks_prefs: true },
        }),
      ]);

      const prefs = (userRow?.tasks_prefs ?? {}) as Record<string, unknown>;
      const defaultSequential = typeof prefs.default_sequential === "boolean" ? prefs.default_sequential : false;
      const defaultReviewInterval = typeof prefs.default_review_interval_days === "number"
        ? prefs.default_review_interval_days
        : null;

      const position = (maxAgg._max.position
        ? new Prisma.Decimal(maxAgg._max.position).plus(1024)
        : new Prisma.Decimal(1024)
      ).toString();

      const typeValue = input.type ?? "project";

      const project = await db.project.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          title: input.title,
          notes: input.notes ?? null,
          color: input.color ?? null,
          sequential: input.sequential ?? defaultSequential,
          status: input.status ?? "active",
          type: typeValue,
          target_date: input.target_date ? new Date(input.target_date) : null,
          position: new Prisma.Decimal(position),
          folder_id: input.folder_id ?? null,
          review_interval_days: input.review_interval_days ?? defaultReviewInterval,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: project.id,
        action: "create",
        meta: { title: project.title },
      });
      return project;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        notes: z.string().max(10_000).nullable().optional(),
        color: z.string().max(40).nullable().optional(),
        sequential: z.boolean().optional(),
        status: PROJECT_STATUS.optional(),
        type: PROJECT_TYPE_STRING.optional(),
        target_date: z.string().datetime({ offset: true }).nullable().optional(),
        folder_id: z.string().uuid().nullable().optional(),
        review_interval_days: z.number().int().nullable().optional(),
        parent_project_id: z.undefined({
          errorMap: () => ({ message: "Projects cannot be nested inside other projects. Use folders to organise projects." }),
        }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const data: Prisma.ProjectUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.color !== undefined) data.color = input.color;
      if (input.sequential !== undefined) data.sequential = input.sequential;
      if (input.folder_id !== undefined) {
        if (input.folder_id) {
          const folder = await db.projectFolder.findFirst({
            where: { id: input.folder_id, user_id: ctx.user.id, deleted_at: null },
          });
          if (!folder) throw new TRPCError({ code: "FORBIDDEN", message: "Folder not found" });
        }
        data.folder = input.folder_id ? { connect: { id: input.folder_id } } : { disconnect: true };
      }
      if (input.review_interval_days !== undefined) {
        data.review_interval_days = input.review_interval_days;
      }
      if (input.status !== undefined) {
        data.status = input.status;
        data.completed_at =
          input.status === "completed" ? new Date() : null;
      }
      if (input.type !== undefined) {
        data.type = input.type;
      }
      if (input.target_date !== undefined) {
        data.target_date = input.target_date ? new Date(input.target_date) : null;
      }

      const updated = await db.project.update({
        where: { id: input.id },
        data,
      });

      const statusChanged = input.status !== undefined && input.status !== before.status;
      const typeChanged = input.type !== undefined && input.type !== before.type;

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: updated.id,
        action: typeChanged
          ? "project_type_changed"
          : statusChanged
            ? "project_status_changed"
            : "update",
        before: before as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        moveTasksToInbox: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      await db.$transaction(async (tx) => {
        if (input.moveTasksToInbox) {
          await tx.task.updateMany({
            where: { project_id: project.id, user_id: ctx.user.id },
            data: { project_id: null },
          });
        } else {
          await tx.task.updateMany({
            where: { project_id: project.id, user_id: ctx.user.id },
            data: { deleted_at: new Date() },
          });
        }
        await tx.project.update({
          where: { id: project.id },
          data: { deleted_at: new Date() },
        });
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: project.id,
        action: "delete",
      });
      return { ok: true };
    }),

  renameType: protectedProcedure
    .input(
      z.object({
        from: PROJECT_TYPE_STRING,
        to: PROJECT_TYPE_STRING,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.from === input.to) return { count: 0 };

      const BUILT_IN_TYPES = ["project", "goal"];
      if (BUILT_IN_TYPES.includes(input.from)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${input.from}" is a built-in type and cannot be renamed`,
        });
      }

      const projects = await db.project.findMany({
        where: { user_id: ctx.user.id, type: input.from, deleted_at: null },
        select: { id: true, type: true },
      });

      if (projects.length === 0) return { count: 0 };

      await db.project.updateMany({
        where: { user_id: ctx.user.id, type: input.from, deleted_at: null },
        data: { type: input.to },
      });

      await Promise.all(
        projects.map((p) =>
          logActivity({
            user_id: ctx.user.id,
            entity_type: "Project",
            entity_id: p.id,
            action: "project_type_changed",
            before: { type: input.from },
            after: { type: input.to },
            meta: { operation: "rename_type" },
          }),
        ),
      );

      return { count: projects.length };
    }),

  mergeTypes: protectedProcedure
    .input(
      z.object({
        source: PROJECT_TYPE_STRING,
        target: PROJECT_TYPE_STRING,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.source === input.target) return { count: 0 };

      const BUILT_IN_TYPES = ["project", "goal"];
      if (BUILT_IN_TYPES.includes(input.source)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${input.source}" is a built-in type and cannot be merged`,
        });
      }

      const projects = await db.project.findMany({
        where: { user_id: ctx.user.id, type: input.source, deleted_at: null },
        select: { id: true, type: true },
      });

      if (projects.length === 0) return { count: 0 };

      await db.project.updateMany({
        where: { user_id: ctx.user.id, type: input.source, deleted_at: null },
        data: { type: input.target },
      });

      await Promise.all(
        projects.map((p) =>
          logActivity({
            user_id: ctx.user.id,
            entity_type: "Project",
            entity_id: p.id,
            action: "project_type_changed",
            before: { type: input.source },
            after: { type: input.target },
            meta: { operation: "merge_type" },
          }),
        ),
      );

      return { count: projects.length };
    }),

  markAllComplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await db.task.updateMany({
        where: {
          project_id: project.id,
          user_id: ctx.user.id,
          status: "active",
        },
        data: { status: "completed", completed_at: new Date() },
      });
      return { ok: true, count: result.count };
    }),
});

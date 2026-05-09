"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Table2, SlidersHorizontal, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NotesShell } from "@/components/notes/notes-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SortState, FilterState, ColumnType, FilterOperator } from "@/core/tables/types";
import { getOperatorsForType, OPERATOR_LABELS } from "@/core/tables/types";

// TableGrid is ~78 KB and only used on this route. Dynamic-import keeps
// it out of the shared client baseline chunk (audit perf-bundle-i).
const TableGrid = dynamic(
  () => import("@/components/tables/table-grid").then((m) => m.TableGrid),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 p-4">
        <Skeleton variant="block" />
        <Skeleton variant="block" />
        <Skeleton variant="block" />
      </div>
    ),
  },
);

const SORT_STORAGE_KEY = (id: string) => `table-sort-${id}`;
const FILTER_STORAGE_KEY = (id: string) => `table-filter-${id}`;

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export default function TableEditorPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const router = useRouter();

  const tableQuery = trpc.tables.get.useQuery({ id: tableId });
  const userQuery = trpc.user.me.useQuery();
  const table = tableQuery.data;
  const currencySymbol = userQuery.data?.currency_symbol ?? "$";

  const [sort, setSort] = React.useState<SortState>(() =>
    loadFromStorage(SORT_STORAGE_KEY(tableId), { column_id: null, direction: "asc" as const }),
  );

  const [filter, setFilter] = React.useState<FilterState | null>(() =>
    loadFromStorage(FILTER_STORAGE_KEY(tableId), null),
  );

  const [showSortPanel, setShowSortPanel] = React.useState(false);
  const [showFilterPanel, setShowFilterPanel] = React.useState(false);

  const [filterColId, setFilterColId] = React.useState<string>("");
  const [filterOp, setFilterOp] = React.useState<FilterOperator>("contains");
  const [filterVal, setFilterVal] = React.useState<string>("");
  const [filterMultiIds, setFilterMultiIds] = React.useState<string[]>([]);

  const utils = trpc.useUtils();

  function handleSortChange(s: SortState) {
    setSort(s);
    saveToStorage(SORT_STORAGE_KEY(tableId), s);
  }

  function handleFilterChange(f: FilterState | null) {
    setFilter(f);
    saveToStorage(FILTER_STORAGE_KEY(tableId), f);
  }

  function applyFilter() {
    if (!filterColId) return;
    const col = table?.columns.find((c) => c.id === filterColId);
    if (filterOp === "is_empty" || filterOp === "is_not_empty") {
      handleFilterChange({ column_id: filterColId, operator: filterOp, value: null });
    } else if (filterOp === "contains_any_of" || filterOp === "contains_all_of") {
      handleFilterChange({ column_id: filterColId, operator: filterOp, value: filterMultiIds });
    } else {
      const val =
        col?.type === "number" || col?.type === "currency"
          ? parseFloat(filterVal) || null
          : col?.type === "checkbox"
            ? filterVal === "true"
            : filterVal || null;
      handleFilterChange({ column_id: filterColId, operator: filterOp, value: val });
    }
    setShowFilterPanel(false);
  }

  function clearFilter() {
    handleFilterChange(null);
    setShowFilterPanel(false);
  }

  if (tableQuery.isLoading) {
    return (
      <NotesShell>
        <div className="flex h-full items-center justify-center">
          <span className="font-ui text-sm text-text-disabled">Loading table…</span>
        </div>
      </NotesShell>
    );
  }

  if (!table) {
    return (
      <NotesShell>
        <div className="flex h-full items-center justify-center">
          <span className="font-ui text-sm text-text-disabled">Table not found</span>
        </div>
      </NotesShell>
    );
  }

  // Cast once to break the deep tRPC generic type instantiation (TS2589).
  // The tRPC inferred return type for tables.get nests too deeply for tsc to
  // resolve; casting via `unknown` severs the chain without losing runtime safety.
  type RawCell = { column_id: string; value: unknown; [k: string]: unknown };
  type RawRow = { cells: RawCell[]; [k: string]: unknown };
  const tableRows = table.rows as unknown as RawRow[];

  const visibleRowCount = filter
    ? tableRows.filter((row) => {
        const col = table.columns.find((c) => c.id === filter.column_id);
        if (!col) return true;
        return row.cells.some((c) => c.column_id === filter.column_id);
      }).length
    : tableRows.length;

  const columns = table.columns.map((col) => ({
    ...col,
    config: (col.config ?? {}) as Record<string, unknown>,
  }));

  const rows = tableRows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      value: cell.value as string | number | boolean | { option_ids: string[] } | null,
    })),
  }));

  return (
    <NotesShell>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-text-tertiary hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <Table2 size={16} className="text-text-tertiary" />
          <h1 className="font-ui text-base font-semibold text-text-primary">{table.name}</h1>
          <span className="font-ui text-xs text-text-disabled">
            {table.rows.length} row{table.rows.length !== 1 ? "s" : ""}
            {filter ? ` (${visibleRowCount} visible)` : ""}
          </span>
          {table.drive_synced_at && (
            <span className="ml-auto font-ui text-2xs text-text-disabled">
              Synced {new Date(table.drive_synced_at).toLocaleDateString()}
            </span>
          )}
          {table.drive_sync_error && (
            <span
              className="text-accent-danger ml-auto font-ui text-2xs"
              title={table.drive_sync_error}
            >
              Sync error
            </span>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
          {/* Sort */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSortPanel(!showSortPanel);
                setShowFilterPanel(false);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-ui text-xs",
                sort.column_id
                  ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                  : "border-border-default text-text-secondary hover:bg-surface-hover",
              )}
            >
              <SlidersHorizontal size={12} />
              Sort
              {sort.column_id
                ? `: ${table.columns.find((c) => c.id === sort.column_id)?.name}`
                : ""}
            </button>

            {showSortPanel && (
              <div className="bg-surface-overlay absolute left-0 top-9 z-40 w-64 rounded-lg border border-border-default shadow-3">
                <div className="p-3">
                  <p className="mb-2 font-ui text-xs font-medium text-text-secondary">Sort by</p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleSortChange({ column_id: null, direction: "asc" });
                        setShowSortPanel(false);
                      }}
                      className={cn(
                        "rounded-sm px-2 py-1 text-left font-ui text-xs",
                        !sort.column_id
                          ? "bg-accent-primary-subtle text-accent-primary"
                          : "text-text-secondary hover:bg-surface-hover",
                      )}
                    >
                      — None (manual order) —
                    </button>
                    {table.columns.map((col) => (
                      <div key={col.id} className="flex gap-1">
                        {(["asc", "desc"] as const).map((dir) => (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => {
                              handleSortChange({ column_id: col.id, direction: dir });
                              setShowSortPanel(false);
                            }}
                            className={cn(
                              "flex-1 rounded-sm px-2 py-1 text-left font-ui text-xs",
                              sort.column_id === col.id && sort.direction === dir
                                ? "bg-accent-primary-subtle text-accent-primary"
                                : "text-text-secondary hover:bg-surface-hover",
                            )}
                          >
                            {col.name} {dir === "asc" ? "↑" : "↓"}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFilterPanel(!showFilterPanel);
                setShowSortPanel(false);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-ui text-xs",
                filter
                  ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                  : "border-border-default text-text-secondary hover:bg-surface-hover",
              )}
            >
              <Filter size={12} />
              {filter
                ? `Filter: ${table.columns.find((c) => c.id === filter.column_id)?.name ?? "…"}`
                : "Filter"}
            </button>

            {showFilterPanel && (
              <div className="bg-surface-overlay absolute left-0 top-9 z-40 w-72 rounded-lg border border-border-default p-3 shadow-3">
                <p className="mb-2 font-ui text-xs font-medium text-text-secondary">Filter rows</p>
                <div className="flex flex-col gap-2">
                  <select
                    value={filterColId}
                    onChange={(e) => {
                      setFilterColId(e.target.value);
                      setFilterMultiIds([]);
                      const col = table.columns.find((c) => c.id === e.target.value);
                      const firstOp = getOperatorsForType((col?.type as ColumnType) ?? "text")[0];
                      if (firstOp) setFilterOp(firstOp);
                    }}
                    className="rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:outline-none"
                  >
                    <option value="">— Pick column —</option>
                    {table.columns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>

                  {filterColId && (
                    <>
                      <select
                        value={filterOp}
                        onChange={(e) => setFilterOp(e.target.value as FilterOperator)}
                        className="rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:outline-none"
                      >
                        {getOperatorsForType(
                          (table.columns.find((c) => c.id === filterColId)?.type as ColumnType) ??
                            "text",
                        ).map((op) => (
                          <option key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>

                      {filterOp !== "is_empty" &&
                        filterOp !== "is_not_empty" &&
                        filterOp !== "contains_any_of" &&
                        filterOp !== "contains_all_of" && (
                          <input
                            value={filterVal}
                            onChange={(e) => setFilterVal(e.target.value)}
                            placeholder="Filter value…"
                            className="rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:outline-none"
                          />
                        )}
                      {(filterOp === "contains_any_of" || filterOp === "contains_all_of") &&
                        (() => {
                          const col = table.columns.find((c) => c.id === filterColId);
                          const opts = ((col?.config as Record<string, unknown>)?.options ??
                            []) as Array<{ id: string; label: string; color?: string }>;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {opts.length === 0 && (
                                <span className="font-ui text-xs text-text-disabled">
                                  No options defined for this column
                                </span>
                              )}
                              {opts.map((opt) => {
                                const active = filterMultiIds.includes(opt.id);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() =>
                                      setFilterMultiIds((prev) =>
                                        active
                                          ? prev.filter((id) => id !== opt.id)
                                          : [...prev, opt.id],
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-ui text-xs ${active ? "border-accent-primary bg-accent-primary-subtle text-accent-primary" : "border-border-default bg-surface-base text-text-secondary"}`}
                                  >
                                    {opt.color && (
                                      <span
                                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: opt.color }}
                                      />
                                    )}
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={applyFilter}
                          className="flex-1 rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
                        >
                          Apply
                        </button>
                        {filter && (
                          <button
                            type="button"
                            onClick={clearFilter}
                            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        <div
          className="flex-1 overflow-auto"
          onClick={() => {
            setShowSortPanel(false);
            setShowFilterPanel(false);
          }}
        >
          <div className="mx-auto max-w-5xl px-4 py-4">
            <TableGrid
              tableId={tableId}
              columns={columns as any}
              rows={rows as any}
              sort={sort}
              filter={filter}
              currencySymbol={currencySymbol}
              onSortChange={handleSortChange}
              onFilterChange={handleFilterChange}
              onRefresh={() => utils.tables.get.invalidate({ id: tableId })}
            />
          </div>
        </div>
      </div>
    </NotesShell>
  );
}

"use client";

import * as React from "react";
import { X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { TableGrid } from "./table-grid";
import type { SortState, FilterState } from "@/core/tables/types";

interface TableSidePanelProps {
  tableId: string;
  onClose: () => void;
  currencySymbol?: string;
}

export function TableSidePanel({ tableId, onClose, currencySymbol = "$" }: TableSidePanelProps) {
  const tableQuery = trpc.tables.get.useQuery({ id: tableId });
  const utils = trpc.useUtils();

  const [sort, setSort] = React.useState<SortState>({ column_id: null, direction: "asc" });
  const [filter, setFilter] = React.useState<FilterState | null>(null);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const table = tableQuery.data;

  const columns = (table?.columns ?? []).map((col) => ({
    ...col,
    config: (col.config ?? {}) as Record<string, unknown>,
  }));

  const rows = (table?.rows ?? []).map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      value: cell.value as string | number | boolean | null,
    })),
  }));

  return (
    <div className="flex h-full flex-col border-l border-border-subtle bg-surface-base">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-ui text-sm font-semibold text-text-primary">
            {table?.name ?? "Loading…"}
          </h2>
          {table && (
            <span className="font-ui text-xs text-text-disabled">{table.rows.length} rows</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/notes/tables/${tableId}`}
            className="flex items-center gap-1 rounded-sm px-2 py-1 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            Open full <ExternalLink size={10} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tableQuery.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-ui text-sm text-text-disabled">Loading…</span>
          </div>
        ) : !table ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-ui text-sm text-text-disabled">Table not found</span>
          </div>
        ) : (
          <TableGrid
            tableId={tableId}
            columns={columns as any}
            rows={rows as any}
            sort={sort}
            filter={filter}
            currencySymbol={currencySymbol}
            onSortChange={setSort}
            onFilterChange={setFilter}
            onRefresh={() => utils.tables.get.invalidate({ id: tableId })}
          />
        )}
      </div>
    </div>
  );
}

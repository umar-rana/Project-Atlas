"use client";

import * as React from "react";
import {
  GripVertical,
  Plus,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { TextCell } from "./cells/text-cell";
import { NumberCell } from "./cells/number-cell";
import { DateCell } from "./cells/date-cell";
import { CheckboxCell } from "./cells/checkbox-cell";
import { SingleSelectCell } from "./cells/single-select-cell";
import { CurrencyCell } from "./cells/currency-cell";
import { computeAggregation, getAvailableAggregations, AGGREGATION_LABELS } from "@/core/tables/aggregations";
import { sortRows } from "@/core/tables/sort";
import { filterRows } from "@/core/tables/filter";
import { DEFAULT_AGGREGATIONS, COLUMN_TYPES } from "@/core/tables/types";
import type {
  TableColumnData,
  TableRowData,
  SortState,
  FilterState,
  ColumnType,
  AggregationType,
  ColumnConfig,
  SingleSelectOption,
} from "@/core/tables/types";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface CellPos { rowId: string; colId: string; }

interface TableGridProps {
  tableId: string;
  columns: TableColumnData[];
  rows: TableRowData[];
  sort: SortState;
  filter: FilterState | null;
  currencySymbol?: string;
  onSortChange: (s: SortState) => void;
  onFilterChange: (f: FilterState | null) => void;
  onRefresh: () => void;
}

type CellState = "idle" | "selected" | "editing";

export function TableGrid({
  tableId,
  columns,
  rows,
  sort,
  filter,
  currencySymbol = "$",
  onSortChange,
  onFilterChange,
  onRefresh,
}: TableGridProps) {
  const [selectedCell, setSelectedCell] = React.useState<CellPos | null>(null);
  const [editingCell, setEditingCell] = React.useState<CellPos | null>(null);
  const [addingColumn, setAddingColumn] = React.useState(false);
  const [newColName, setNewColName] = React.useState("");
  const [newColType, setNewColType] = React.useState<ColumnType>("text");
  const [renamingCol, setRenamingCol] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [draggingRowId, setDraggingRowId] = React.useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = React.useState<string | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertCell = (trpc.tables.upsertCell as any).useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  }) as { mutate: (args: { row_id: string; column_id: string; value: unknown }) => void; isPending: boolean };

  const addRow = trpc.tables.addRow.useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  });

  const deleteRow = trpc.tables.deleteRow.useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  });

  const reorderRows = trpc.tables.reorderRows.useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  });

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- TS2589: tRPC type inference depth; safe at runtime
  const addColumn = trpc.tables.addColumn.useMutation({
    onSuccess: () => {
      setAddingColumn(false);
      setNewColName("");
      utils.tables.get.invalidate({ id: tableId });
    },
  });

  const updateColumn = trpc.tables.updateColumn.useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  });

  const deleteColumn = trpc.tables.deleteColumn.useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  });

  const reorderColumns = trpc.tables.reorderColumns.useMutation({
    onSuccess: () => utils.tables.get.invalidate({ id: tableId }),
  });

  const visibleRows = React.useMemo(() => {
    const filtered = filterRows(rows, filter, columns);
    return sortRows(filtered, sort, columns);
  }, [rows, columns, sort, filter]);

  function getCellState(rowId: string, colId: string): CellState {
    if (editingCell?.rowId === rowId && editingCell?.colId === colId) return "editing";
    if (selectedCell?.rowId === rowId && selectedCell?.colId === colId) return "selected";
    return "idle";
  }

  function getCellValue(row: TableRowData, colId: string) {
    const cell = row.cells.find((c) => c.column_id === colId);
    return cell?.value ?? null;
  }

  function handleCellClick(rowId: string, colId: string) {
    if (selectedCell?.rowId === rowId && selectedCell?.colId === colId) {
      setEditingCell({ rowId, colId });
    } else {
      setSelectedCell({ rowId, colId });
      setEditingCell(null);
    }
  }

  function handleCellCommit(rowId: string, colId: string, value: unknown) {
    setEditingCell(null);
    upsertCell.mutate({ row_id: rowId, column_id: colId, value });
  }

  function handleCellCancel() {
    setEditingCell(null);
  }

  function moveSelection(dRow: number, dCol: number) {
    if (!selectedCell) return;
    const rowIdx = visibleRows.findIndex((r) => r.id === selectedCell.rowId);
    const colIdx = columns.findIndex((c) => c.id === selectedCell.colId);
    const newRowIdx = Math.max(0, Math.min(visibleRows.length - 1, rowIdx + dRow));
    const newColIdx = Math.max(0, Math.min(columns.length - 1, colIdx + dCol));
    const newRow = visibleRows[newRowIdx];
    const newCol = columns[newColIdx];
    if (!newRow || !newCol) return;
    setSelectedCell({ rowId: newRow.id, colId: newCol.id });
    setEditingCell(null);
  }

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedCell) return;
      const isEditing = editingCell !== null;

      if (e.key === "ArrowDown" && !isEditing) { e.preventDefault(); moveSelection(1, 0); return; }
      if (e.key === "ArrowUp" && !isEditing) { e.preventDefault(); moveSelection(-1, 0); return; }
      if (e.key === "ArrowRight" && !isEditing) { e.preventDefault(); moveSelection(0, 1); return; }
      if (e.key === "ArrowLeft" && !isEditing) { e.preventDefault(); moveSelection(0, -1); return; }

      if (e.key === "Tab" && !isEditing) {
        e.preventDefault();
        const colIdx = columns.findIndex((c) => c.id === selectedCell.colId);
        const rowIdx = visibleRows.findIndex((r) => r.id === selectedCell.rowId);
        const nextCol = columns[colIdx + 1];
        const nextRow = visibleRows[rowIdx + 1];
        const firstCol = columns[0];
        if (colIdx < columns.length - 1 && nextCol) {
          setSelectedCell({ rowId: selectedCell.rowId, colId: nextCol.id });
        } else if (rowIdx < visibleRows.length - 1 && nextRow && firstCol) {
          setSelectedCell({ rowId: nextRow.id, colId: firstCol.id });
        }
        return;
      }

      if (e.key === "Enter" && !isEditing) {
        e.preventDefault();
        moveSelection(1, 0);
        return;
      }

      if (e.key === "Escape" && isEditing) {
        e.preventDefault();
        setEditingCell(null);
        return;
      }

      if (!isEditing && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const col = columns.find((c) => c.id === selectedCell.colId);
        if (col && col.type !== "checkbox") {
          setEditingCell(selectedCell);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCell, editingCell, columns, visibleRows]);

  function handleGridClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target === gridRef.current || target.getAttribute("data-grid-bg") === "true") {
      setSelectedCell(null);
      setEditingCell(null);
    }
  }

  function renderCell(row: TableRowData, col: TableColumnData) {
    const state = getCellState(row.id, col.id);
    const rawValue = getCellValue(row, col.id);
    const config = col.config as ColumnConfig;
    const opts = (config.options ?? []) as SingleSelectOption[];

    const commonProps = {
      isSelected: state === "selected",
      isEditing: state === "editing",
      onStartEdit: () => setEditingCell({ rowId: row.id, colId: col.id }),
      onCancel: handleCellCancel,
    };

    switch (col.type) {
      case "text":
        return (
          <TextCell
            {...commonProps}
            value={typeof rawValue === "string" ? rawValue : null}
            onCommit={(v) => handleCellCommit(row.id, col.id, v)}
          />
        );
      case "number":
        return (
          <NumberCell
            {...commonProps}
            value={typeof rawValue === "number" ? rawValue : null}
            decimalPlaces={config.decimal_places ?? 2}
            onCommit={(v) => handleCellCommit(row.id, col.id, v)}
          />
        );
      case "currency":
        return (
          <CurrencyCell
            {...commonProps}
            value={typeof rawValue === "number" ? rawValue : null}
            currencySymbol={currencySymbol}
            decimalPlaces={config.decimal_places ?? 2}
            onCommit={(v) => handleCellCommit(row.id, col.id, v)}
          />
        );
      case "date":
        return (
          <DateCell
            {...commonProps}
            value={typeof rawValue === "string" ? rawValue : null}
            onCommit={(v) => handleCellCommit(row.id, col.id, v)}
          />
        );
      case "checkbox":
        return (
          <CheckboxCell
            {...commonProps}
            value={typeof rawValue === "boolean" ? rawValue : null}
            onCommit={(v) => handleCellCommit(row.id, col.id, v)}
          />
        );
      case "single_select":
        return (
          <SingleSelectCell
            {...commonProps}
            value={typeof rawValue === "string" ? rawValue : null}
            options={opts}
            onCommit={(v) => handleCellCommit(row.id, col.id, v)}
          />
        );
      default:
        return null;
    }
  }

  function handleColumnSort(colId: string) {
    if (sort.column_id === colId) {
      if (sort.direction === "asc") {
        onSortChange({ column_id: colId, direction: "desc" });
      } else {
        onSortChange({ column_id: null, direction: "asc" });
      }
    } else {
      onSortChange({ column_id: colId, direction: "asc" });
    }
  }

  function handleMoveColumn(colId: string, direction: "left" | "right") {
    const idx = columns.findIndex((c) => c.id === colId);
    if (direction === "left" && idx > 0) {
      const insertAfter = idx >= 2 ? (columns[idx - 2]?.id ?? null) : null;
      reorderColumns.mutate({ table_id: tableId, column_id: colId, insert_after_id: insertAfter });
    } else if (direction === "right" && idx < columns.length - 1) {
      const insertAfter = columns[idx + 1]?.id;
      if (insertAfter) reorderColumns.mutate({ table_id: tableId, column_id: colId, insert_after_id: insertAfter });
    }
  }

  const ROW_HEIGHT = 36;
  const HEADER_HEIGHT = 40;
  const FOOTER_HEIGHT = 36;

  return (
    <div
      ref={gridRef}
      data-grid-bg="true"
      onClick={handleGridClick}
      className="relative overflow-x-auto"
    >
      <table className="border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 36 }} />
          {columns.map((col) => (
            <col key={col.id} style={{ width: col.width || 160 }} />
          ))}
          <col style={{ width: 120 }} />
        </colgroup>

        {/* Header */}
        <thead>
          <tr style={{ height: HEADER_HEIGHT }}>
            <th className="border-b-2 border-r border-border-default bg-surface-sunken" />
            {columns.map((col, idx) => (
              <th
                key={col.id}
                className="border-b-2 border-r border-border-default bg-surface-sunken"
              >
                <div className="group flex h-full items-center gap-1 px-2">
                  {renamingCol === col.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => {
                        const n = renameDraft.trim();
                        if (n && n !== col.name) updateColumn.mutate({ id: col.id, name: n });
                        setRenamingCol(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const n = renameDraft.trim();
                          if (n && n !== col.name) updateColumn.mutate({ id: col.id, name: n });
                          setRenamingCol(null);
                        }
                        if (e.key === "Escape") setRenamingCol(null);
                      }}
                      className="min-w-0 flex-1 bg-transparent font-ui text-xs font-semibold text-text-primary focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleColumnSort(col.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 font-ui text-xs hover:text-text-primary"
                    >
                      <span className="truncate font-semibold text-text-primary tracking-wide uppercase text-[11px]">{col.name}</span>
                      <span className="shrink-0 text-2xs text-text-disabled capitalize">
                        {COLUMN_TYPES.find((t) => t.value === col.type)?.label ?? col.type}
                      </span>
                      {sort.column_id === col.id && (
                        sort.direction === "asc"
                          ? <ChevronUp size={11} className="shrink-0 text-accent-primary" />
                          : <ChevronDown size={11} className="shrink-0 text-accent-primary" />
                      )}
                    </button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 rounded-sm p-0.5 text-text-disabled opacity-0 hover:bg-surface-hover hover:text-text-tertiary group-hover:opacity-100"
                      >
                        <MoreHorizontal size={12} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem onClick={() => { setRenamingCol(col.id); setRenameDraft(col.name); }}>
                        <Pencil size={12} className="mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMoveColumn(col.id, "left")} disabled={idx === 0}>
                        <ArrowLeft size={12} className="mr-2" /> Move left
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMoveColumn(col.id, "right")} disabled={idx === columns.length - 1}>
                        <ArrowRight size={12} className="mr-2" /> Move right
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1">
                        <p className="mb-1 font-ui text-2xs text-text-disabled">Footer</p>
                        {getAvailableAggregations(col.type).map((agg) => (
                          <button
                            key={agg}
                            type="button"
                            onClick={() => updateColumn.mutate({ id: col.id, aggregation: agg === "none" ? null : agg })}
                            className={cn(
                              "block w-full rounded-sm px-2 py-0.5 text-left font-ui text-xs",
                              (col.aggregation ?? "none") === agg
                                ? "bg-accent-primary-subtle text-accent-primary"
                                : "text-text-secondary hover:bg-surface-hover",
                            )}
                          >
                            {AGGREGATION_LABELS[agg]}
                          </button>
                        ))}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-accent-danger focus:text-accent-danger"
                        onClick={() => {
                          if (confirm(`Delete column "${col.name}"? All cell data will be lost.`)) {
                            deleteColumn.mutate({ id: col.id });
                          }
                        }}
                      >
                        <Trash2 size={12} className="mr-2" /> Delete column
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </th>
            ))}
            <th className="border-b-2 border-border-default bg-surface-sunken">
              {addingColumn ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = newColName.trim();
                    if (!n) return;
                    addColumn.mutate({ table_id: tableId, name: n, type: newColType });
                  }}
                  className="flex items-center gap-1 px-2"
                >
                  <input
                    autoFocus
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="Column name"
                    className="min-w-0 flex-1 rounded-sm bg-surface-base px-1 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  />
                  <select
                    value={newColType}
                    onChange={(e) => setNewColType(e.target.value as ColumnType)}
                    className="rounded-sm bg-surface-base px-1 py-0.5 font-ui text-xs text-text-primary focus:outline-none"
                  >
                    {COLUMN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-sm bg-accent-primary px-1.5 py-0.5 font-ui text-2xs text-text-on-accent">Add</button>
                  <button type="button" onClick={() => setAddingColumn(false)} className="rounded-sm px-1 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover">✕</button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingColumn(true); setNewColName(""); }}
                  className="flex h-full w-full items-center gap-1 px-2 font-ui text-xs text-text-disabled hover:text-text-tertiary"
                >
                  <Plus size={12} /> Add column
                </button>
              )}
            </th>
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {visibleRows.length === 0 && rows.length === 0 && (
            <tr>
              <td />
              <td colSpan={columns.length + 1}>
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="font-ui text-xs font-medium text-text-disabled">No rows yet</p>
                  <button
                    type="button"
                    onClick={() => addRow.mutate({ table_id: tableId })}
                    disabled={addRow.isPending}
                    className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                  >
                    <Plus size={12} /> Add first row
                  </button>
                </div>
              </td>
            </tr>
          )}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td />
              <td colSpan={columns.length + 1}>
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="font-ui text-xs font-medium text-text-disabled">No rows match the current filter</p>
                  <button
                    type="button"
                    onClick={() => onFilterChange(null)}
                    className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                  >
                    Clear filter
                  </button>
                </div>
              </td>
            </tr>
          )}
          {visibleRows.map((row, rowIdx) => (
            <tr
              key={row.id}
              style={{ height: ROW_HEIGHT }}
              className={cn(
                "group",
                draggingRowId === row.id && "opacity-50",
                dragOverRowId === row.id && "border-t-2 border-accent-primary",
              )}
              draggable={!sort.column_id}
              onDragStart={() => setDraggingRowId(row.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverRowId(row.id); }}
              onDragLeave={() => setDragOverRowId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverRowId(null);
                if (draggingRowId && draggingRowId !== row.id) {
                  const afterIdx = visibleRows.findIndex((r) => r.id === row.id);
                  const beforeIdx = visibleRows.findIndex((r) => r.id === draggingRowId);
                  const insertAfterId = beforeIdx < afterIdx ? row.id : (afterIdx > 0 ? (visibleRows[afterIdx - 1]?.id ?? null) : null);
                  reorderRows.mutate({ table_id: tableId, row_id: draggingRowId, insert_after_id: insertAfterId });
                }
                setDraggingRowId(null);
              }}
              onDragEnd={() => { setDraggingRowId(null); setDragOverRowId(null); }}
            >
              {/* Row handle */}
              <td className="border-b border-r border-border-default bg-surface-sunken">
                <div className="flex h-full items-center justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="text-text-disabled opacity-0 hover:text-text-tertiary group-hover:opacity-100"
                        title={sort.column_id ? "Reorder disabled while sorted" : "Row options"}
                      >
                        <GripVertical size={12} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => addRow.mutate({ table_id: tableId, insert_after_id: rowIdx > 0 ? (visibleRows[rowIdx - 1]?.id ?? undefined) : undefined })}>
                        Insert row above
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addRow.mutate({ table_id: tableId, insert_after_id: row.id })}>
                        Insert row below
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-accent-danger focus:text-accent-danger"
                        onClick={() => {
                          const hasData = row.cells.some((c) => c.value !== null && c.value !== undefined && c.value !== "");
                          if (!hasData || confirm("Delete this row?")) {
                            deleteRow.mutate({ id: row.id });
                          }
                        }}
                      >
                        <Trash2 size={12} className="mr-2" /> Delete row
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>

              {columns.map((col) => (
                <td
                  key={col.id}
                  onClick={() => handleCellClick(row.id, col.id)}
                  className="relative border-b border-r border-border-default bg-surface-base overflow-hidden"
                  style={{ height: ROW_HEIGHT }}
                >
                  {renderCell(row, col)}
                </td>
              ))}

              <td className="border-b border-border-default bg-surface-base" />
            </tr>
          ))}

          {/* Add row — only when there are visible rows (empty state has its own add button) */}
          {visibleRows.length > 0 && (
            <tr>
              <td className="border-b border-r border-border-default bg-surface-sunken" />
              <td colSpan={columns.length + 1} className="border-b border-border-default">
                <button
                  type="button"
                  onClick={() => addRow.mutate({ table_id: tableId })}
                  disabled={addRow.isPending}
                  className="flex w-full items-center gap-1.5 px-3 py-2 font-ui text-xs text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
                >
                  <Plus size={12} />
                  Add row
                </button>
              </td>
            </tr>
          )}
        </tbody>

        {/* Footer */}
        <tfoot className="sticky bottom-0 z-10">
          <tr style={{ height: FOOTER_HEIGHT }}>
            <td className="border-t border-r border-border-default bg-surface-sunken" />
            {columns.map((col) => {
              const agg = col.aggregation as AggregationType | null;
              const result = computeAggregation(col.type, agg, visibleRows, col.id);
              return (
                <td key={col.id} className="border-t border-r border-border-default bg-surface-sunken px-2">
                  {result ? (
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-ui text-2xs text-text-disabled">{AGGREGATION_LABELS[agg!]}</span>
                      <span className="font-ui text-xs font-medium tabular-nums text-text-primary">{result}</span>
                    </div>
                  ) : null}
                </td>
              );
            })}
            <td className="border-t border-border-default bg-surface-sunken" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

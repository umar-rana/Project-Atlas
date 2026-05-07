"use client";

import * as React from "react";
import Papa from "papaparse";
import { Upload, X, ChevronRight, ChevronLeft, FileText, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { detectColumns } from "@/core/tables/csv-type-detect";
import type { ColumnType } from "@/core/tables/types";
import { COLUMN_TYPES } from "@/core/tables/types";

const IMPORT_TABLE_ENDPOINT = "/api/convert/import-table";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLS = 50;
const PREVIEW_ROWS = 10;

interface CsvImportWizardProps {
  defaultFolderId?: string | null;
  defaultProjectId?: string | null;
  onClose: () => void;
  onImported: (tableId: string) => void;
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  totalRows: number;
  fileName: string;
  encoding: "utf-8" | "latin1";
  encodingWarning?: string;
}

interface ColumnDef {
  name: string;
  type: ColumnType;
}

type WizardStep = 1 | 2 | 3;

function fileToText(file: File, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, encoding);
  });
}

export function CsvImportWizard({
  defaultFolderId,
  defaultProjectId,
  onClose,
  onImported,
}: CsvImportWizardProps) {
  const [step, setStep] = React.useState<WizardStep>(1);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<ParsedCsv | null>(null);
  const [columns, setColumns] = React.useState<ColumnDef[]>([]);
  const [tableName, setTableName] = React.useState("");
  const [folderId, setFolderId] = React.useState<string>(defaultFolderId ?? "");
  const [projectId, setProjectId] = React.useState<string>(defaultProjectId ?? "");
  const [isPending, setIsPending] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const originalFileRef = React.useRef<File | null>(null);

  const foldersQuery = trpc.tablesFolders.list.useQuery();
  const projectsQuery = trpc.projects.list.useQuery({ include_all_statuses: false });

  type FlatFolder = { id: string; label: string };
  function flattenFolders(nodes: { id: string; name: string; children: unknown[] }[], depth: number): FlatFolder[] {
    const out: FlatFolder[] = [];
    for (const n of nodes) {
      out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
      out.push(...flattenFolders(n.children as { id: string; name: string; children: unknown[] }[], depth + 1));
    }
    return out;
  }

  const folderOptions = flattenFolders(
    (foldersQuery.data ?? []) as { id: string; name: string; children: unknown[] }[],
    0,
  );

  async function handleFile(file: File) {
    setFileError(null);
    setParsed(null);
    originalFileRef.current = null;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Only .csv files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Maximum size is 10 MB.");
      return;
    }

    let rawText: string;
    let encoding: "utf-8" | "latin1" = "utf-8";
    let encodingWarning: string | undefined;

    try {
      rawText = await fileToText(file, "utf-8");
      if (rawText.includes("\uFFFD")) {
        rawText = await fileToText(file, "latin1");
        encoding = "latin1";
        encodingWarning =
          "File is not valid UTF-8. It was read using Latin-1 encoding — some characters may appear incorrectly.";
      }
    } catch {
      setFileError("Failed to read file.");
      return;
    }

    const result = Papa.parse<string[]>(rawText, {
      skipEmptyLines: true,
    });

    if (result.errors.length && !result.data.length) {
      setFileError("Failed to parse CSV file.");
      return;
    }

    const data = result.data as string[][];
    if (data.length < 1) {
      setFileError("The CSV file has no rows.");
      return;
    }
    const headers = (data[0] ?? []).map((h) => h.trim() || "Column");
    const rows = data.slice(1);

    if (rows.length === 0) {
      setFileError("The CSV file has no data rows (only a header row was found).");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setFileError(`Too many rows. Maximum is ${MAX_ROWS.toLocaleString()} rows, but this file has ${rows.length.toLocaleString()}.`);
      return;
    }
    if (headers.length > MAX_COLS) {
      setFileError(`Too many columns. Maximum is ${MAX_COLS} columns, but this file has ${headers.length}.`);
      return;
    }

    const detected = detectColumns(headers, rows);
    setColumns(detected);
    originalFileRef.current = file;
    const defaultName = file.name.replace(/\.csv$/i, "").trim() || "Imported table";
    setTableName(defaultName);
    setParsed({
      headers,
      rows,
      totalRows: rows.length,
      fileName: file.name,
      encoding,
      encodingWarning,
    });
    setStep(2);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function updateColumnName(idx: number, name: string) {
    setColumns((cols) =>
      cols.map((c, i) => (i === idx ? { ...c, name } : c)),
    );
  }

  function updateColumnType(idx: number, type: ColumnType) {
    setColumns((cols) =>
      cols.map((c, i) => (i === idx ? { ...c, type } : c)),
    );
  }

  async function handleImport() {
    if (!parsed || isPending) return;
    const file = originalFileRef.current;
    if (!file) {
      toast.error("File reference lost — please re-select the file.");
      return;
    }
    setIsPending(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("table_name", tableName.trim() || parsed.fileName.replace(/\.csv$/i, "") || "Imported table");
      formData.append("folder_id", folderId || "");
      formData.append("project_id", projectId || "");
      formData.append("columns", JSON.stringify(columns.map((c) => ({ name: c.name, type: c.type }))));

      const res = await fetch(IMPORT_TABLE_ENDPOINT, { method: "POST", body: formData });
      const json = (await res.json()) as { table_id?: string; imported_row_count?: number; failed_cell_count?: number; error?: string };

      if (!res.ok) {
        throw new Error(json.error ?? "Import failed. Please try again.");
      }

      const failedMsg =
        (json.failed_cell_count ?? 0) > 0
          ? ` ${json.failed_cell_count} cell${json.failed_cell_count !== 1 ? "s" : ""} couldn't be parsed and were left empty.`
          : "";
      toast.success(
        `Imported ${json.imported_row_count ?? 0} row${(json.imported_row_count ?? 0) !== 1 ? "s" : ""}.${failedMsg}`,
      );
      onImported(json.table_id!);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Import failed. Please try again.";
      toast.error(msg);
    } finally {
      setIsPending(false);
    }
  }

  const previewRows = parsed ? parsed.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative flex w-full flex-col rounded-xl border border-border-default bg-surface-overlay shadow-4",
          step === 2 ? "max-w-4xl" : "max-w-lg",
        )}
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <FileText size={16} className="text-text-tertiary" />
          <h2 className="flex-1 font-ui text-md font-semibold text-text-primary">
            Import from CSV
          </h2>
          <div className="flex items-center gap-2 font-ui text-xs text-text-tertiary">
            {([1, 2, 3] as const).map((s) => (
              <React.Fragment key={s}>
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full font-medium",
                    step === s
                      ? "bg-accent-primary text-text-on-accent"
                      : step > s
                        ? "bg-accent-primary-muted text-accent-primary"
                        : "bg-surface-hover text-text-disabled",
                  )}
                >
                  {s}
                </span>
                {s < 3 && <span className="text-text-disabled">›</span>}
              </React.Fragment>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 text-text-tertiary hover:text-text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop a CSV file here or click to browse"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 transition-colors",
                  isDragging
                    ? "border-accent-primary bg-accent-primary-subtle"
                    : "border-border-default hover:border-accent-primary hover:bg-surface-hover",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
              >
                <Upload size={24} className="text-text-tertiary" />
                <div className="text-center">
                  <p className="font-ui text-sm font-medium text-text-primary">
                    Drop a CSV file here
                  </p>
                  <p className="font-ui text-xs text-text-tertiary">
                    or click to browse — max 10 MB, 10,000 rows, 50 columns
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {fileError && (
                <div className="flex items-start gap-2 rounded-md border border-accent-danger-muted bg-accent-danger-muted px-3 py-2.5">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-accent-danger" />
                  <p className="font-ui text-xs text-accent-danger">{fileError}</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && parsed && (
            <div className="flex flex-col gap-4">
              {parsed.encodingWarning && (
                <div className="flex items-start gap-2 rounded-md border border-accent-warning-muted bg-accent-warning-muted px-3 py-2.5">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-accent-warning" />
                  <p className="font-ui text-xs text-accent-warning">{parsed.encodingWarning}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="font-ui text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{parsed.totalRows.toLocaleString()}</span>{" "}
                  rows · <span className="font-medium text-text-primary">{columns.length}</span> columns
                  {parsed.totalRows > PREVIEW_ROWS && (
                    <> · showing first {PREVIEW_ROWS} rows</>
                  )}
                </p>
                <p className="font-ui text-xs text-text-disabled">{parsed.fileName}</p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border-default">
                <table className="w-full border-collapse font-ui text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-sunken">
                      {columns.map((col, idx) => (
                        <th key={idx} className="min-w-36 border-r border-border-subtle px-2 py-2 text-left last:border-r-0">
                          <div className="flex flex-col gap-1">
                            <input
                              value={col.name}
                              onChange={(e) => updateColumnName(idx, e.target.value)}
                              className="w-full rounded border border-border-default bg-surface-base px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
                              placeholder="Column name"
                            />
                            <select
                              value={col.type}
                              onChange={(e) => updateColumnType(idx, e.target.value as ColumnType)}
                              className="w-full rounded border border-border-default bg-surface-base px-1 py-0.5 text-2xs text-text-secondary focus:border-border-focus focus:outline-none"
                            >
                              {COLUMN_TYPES.map((ct) => (
                                <option key={ct.value} value={ct.value}>
                                  {ct.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={cn(
                          "border-b border-border-subtle last:border-b-0",
                          rowIdx % 2 === 1 ? "bg-surface-sunken/50" : "",
                        )}
                      >
                        {columns.map((_, colIdx) => (
                          <td
                            key={colIdx}
                            className="border-r border-border-subtle px-2 py-1.5 text-xs text-text-primary last:border-r-0"
                          >
                            <span className="line-clamp-1 block max-w-48 text-ellipsis">
                              {row[colIdx] ?? ""}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && parsed && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Table name <span className="text-accent-danger">*</span>
                </label>
                <input
                  autoFocus
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
                  placeholder="Table name"
                />
              </div>

              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Folder
                  <Hint label="Optional — organise this table inside a folder" side="right">
                    <span className="ml-1 cursor-default font-ui text-xs text-text-disabled">(optional)</span>
                  </Hint>
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
                >
                  <option value="">— No folder —</option>
                  {folderOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Project
                  <Hint label="Optional — link this table to a project" side="right">
                    <span className="ml-1 cursor-default font-ui text-xs text-text-disabled">(optional)</span>
                  </Hint>
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
                >
                  <option value="">— No project —</option>
                  {(projectsQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
                <p className="font-ui text-xs text-text-secondary">
                  Ready to import{" "}
                  <span className="font-medium text-text-primary">{parsed.totalRows.toLocaleString()} rows</span>{" "}
                  across{" "}
                  <span className="font-medium text-text-primary">{columns.length} columns</span>.
                  Cells that can't be parsed for their column type will be left empty.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as WizardStep)}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-border-default px-4 py-2 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 || !parsed}
                onClick={() => setStep((s) => (s + 1) as WizardStep)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-text-on-accent",
                  "hover:bg-accent-primary-hover disabled:opacity-50",
                )}
              >
                Continue
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                disabled={!tableName.trim() || isPending}
                onClick={handleImport}
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-text-on-accent",
                  "hover:bg-accent-primary-hover disabled:opacity-50",
                )}
              >
                {isPending ? "Importing…" : "Import"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

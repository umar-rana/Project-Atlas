"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Table2, Plus, Search, Folder, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NotesShell } from "@/components/notes/notes-shell";
import { NewTableDialog } from "@/components/tables/new-table-dialog";
import { CsvImportWizard } from "@/components/tables/csv-import-wizard";
import { Hint } from "@/components/ui/hint";

export default function AllTablesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [showDialog, setShowDialog] = React.useState(false);
  const [showImportWizard, setShowImportWizard] = React.useState(false);

  const tablesQuery = trpc.tables.list.useQuery({ limit: 200 });
  const tables = tablesQuery.data ?? [];

  const filtered = search
    ? tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tables;

  return (
    <NotesShell>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Table2 size={16} className="text-text-tertiary" />
          <h1 className="font-ui text-base font-semibold text-text-primary">All tables</h1>
          <span className="font-ui text-xs text-text-disabled">
            {tables.length} table{tables.length !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled"
              />
              <input
                type="text"
                placeholder="Search tables…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 rounded-md border border-border-default bg-surface-base pl-7 pr-3 font-ui text-xs text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
              />
            </div>
            <Hint label="Import a CSV file as a new table">
              <button
                type="button"
                onClick={() => setShowImportWizard(true)}
                className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                <Upload size={13} />
                Import CSV
              </button>
            </Hint>
            <button
              type="button"
              onClick={() => setShowDialog(true)}
              className="flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
            >
              <Plus size={13} />
              New table
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tablesQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <span className="font-ui text-sm text-text-disabled">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <p className="font-ui text-sm text-text-tertiary">
                {search ? `No tables matching "${search}"` : "No tables yet"}
              </p>
              {!search && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDialog(true)}
                    className="font-ui text-xs text-accent-primary hover:underline"
                  >
                    Create your first table
                  </button>
                  <span className="font-ui text-xs text-text-disabled">or</span>
                  <button
                    type="button"
                    onClick={() => setShowImportWizard(true)}
                    className="font-ui text-xs text-accent-primary hover:underline"
                  >
                    import from CSV
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {filtered.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => router.push(`/notes/tables/${table.id}`)}
                  className="flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
                >
                  <Table2 size={16} className="shrink-0 text-text-tertiary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-ui text-sm font-medium text-text-primary">
                      {table.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {table.folder_name && (
                        <span className="flex items-center gap-1 font-ui text-xs text-text-disabled">
                          <Folder size={10} /> {table.folder_name}
                        </span>
                      )}
                      {table.project_title && (
                        <span className="font-ui text-xs text-text-disabled">
                          {table.project_title}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-xs tabular-nums text-text-tertiary">
                      {table.row_count} row{table.row_count !== 1 ? "s" : ""}
                    </span>
                    {table.drive_synced_at && (
                      <span className="font-ui text-2xs text-text-disabled">
                        Synced {new Date(table.drive_synced_at).toLocaleDateString()}
                      </span>
                    )}
                    {table.drive_sync_error && (
                      <span className="text-destructive font-ui text-2xs">Sync error</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDialog && (
        <NewTableDialog
          onClose={() => setShowDialog(false)}
          onCreated={(id) => {
            setShowDialog(false);
            router.push(`/notes/tables/${id}`);
          }}
        />
      )}

      {showImportWizard && (
        <CsvImportWizard
          onClose={() => setShowImportWizard(false)}
          onImported={(id) => {
            setShowImportWizard(false);
            tablesQuery.refetch();
            router.push(`/notes/tables/${id}`);
          }}
        />
      )}
    </NotesShell>
  );
}

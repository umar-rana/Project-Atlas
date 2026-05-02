"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Table2, Plus, Folder } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NotesShell } from "@/components/notes/notes-shell";
import { NewTableDialog } from "@/components/tables/new-table-dialog";

export default function TableFolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const router = useRouter();
  const [showDialog, setShowDialog] = React.useState(false);

  const utils = trpc.useUtils();
  const tablesQuery = trpc.tables.list.useQuery({ folder_id: folderId, limit: 200 });
  const foldersQuery = trpc.tablesFolders.list.useQuery();

  const tables = tablesQuery.data ?? [];

  function getFolderName(nodes: typeof foldersQuery.data, id: string): string | null {
    if (!nodes) return null;
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const child = getFolderName(n.children as typeof foldersQuery.data, id);
      if (child) return child;
    }
    return null;
  }

  const folderName = getFolderName(foldersQuery.data, folderId) ?? "Folder";

  return (
    <NotesShell>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Folder size={16} className="text-text-tertiary" />
          <h1 className="font-ui text-base font-semibold text-text-primary">{folderName}</h1>
          <span className="font-ui text-xs text-text-disabled">
            {tables.length} table{tables.length !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto">
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
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <p className="font-ui text-sm text-text-tertiary">No tables in this folder yet.</p>
              <button
                type="button"
                onClick={() => setShowDialog(true)}
                className="font-ui text-xs text-accent-primary hover:underline"
              >
                Create one
              </button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {tables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => router.push(`/notes/tables/${table.id}`)}
                  className="flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
                >
                  <Table2 size={16} className="shrink-0 text-text-tertiary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-sm font-medium text-text-primary truncate">{table.name}</p>
                    {table.project_title && (
                      <p className="font-ui text-xs text-text-disabled mt-0.5">{table.project_title}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
                    {table.row_count} row{table.row_count !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDialog && (
        <NewTableDialog
          defaultFolderId={folderId}
          onClose={() => setShowDialog(false)}
          onCreated={(id) => {
            setShowDialog(false);
            utils.tables.list.invalidate({ folder_id: folderId });
            router.push(`/notes/tables/${id}`);
          }}
        />
      )}
    </NotesShell>
  );
}

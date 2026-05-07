"use client";

import * as React from "react";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { withRetry, handleTrpcError } from "@/core/errors/error-handler";

interface NewTableDialogProps {
  defaultFolderId?: string | null;
  defaultProjectId?: string | null;
  onClose: () => void;
  onCreated: (tableId: string) => void;
}

export function NewTableDialog({
  defaultFolderId,
  defaultProjectId,
  onClose,
  onCreated,
}: NewTableDialogProps) {
  const [name, setName] = React.useState("");
  const [folderId, setFolderId] = React.useState<string>(defaultFolderId ?? "");
  const [projectId, setProjectId] = React.useState<string>(defaultProjectId ?? "");
  const [isPending, setIsPending] = React.useState(false);

  const foldersQuery = trpc.tablesFolders.list.useQuery();
  const projectsQuery = trpc.projects.list.useQuery({ include_all_statuses: false });

  const createTable = trpc.tables.create.useMutation({
    meta: { suppressGlobalError: true },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    setIsPending(true);
    try {
      const table = await withRetry(() =>
        createTable.mutateAsync({
          name: trimmed,
          folder_id: folderId || null,
          project_id: projectId || null,
        }),
      );
      onCreated(table.id);
      toast.success(`Table "${table.name}" created`);
    } catch (err) {
      toast.error(handleTrpcError(err));
    } finally {
      setIsPending(false);
    }
  }

  type FlatFolder = { id: string; label: string };
  function flattenFolders(
    nodes: { id: string; name: string; children: unknown[] }[],
    depth: number,
  ): FlatFolder[] {
    const out: FlatFolder[] = [];
    for (const n of nodes) {
      out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
      out.push(
        ...flattenFolders(
          n.children as { id: string; name: string; children: unknown[] }[],
          depth + 1,
        ),
      );
    }
    return out;
  }

  const folderOptions = flattenFolders(
    (foldersQuery.data ?? []) as { id: string; name: string; children: unknown[] }[],
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border-default bg-surface-base p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-ui text-base font-semibold text-text-primary">New table</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
              Name <span className="text-accent-danger">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My table"
              className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
              Folder (optional)
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
              Project (optional)
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

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default px-4 py-2 font-ui text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isPending}
              className={cn(
                "rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-text-on-accent",
                "hover:bg-accent-primary-hover disabled:opacity-50",
              )}
            >
              {isPending ? "Creating…" : "Create table"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

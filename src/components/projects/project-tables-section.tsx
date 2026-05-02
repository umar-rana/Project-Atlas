"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export function ProjectTablesSection({ projectId }: { projectId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.tables.list.useQuery({ project_id: projectId, limit: 100 });
  const tables = data ?? [];

  const createTable = trpc.tables.create.useMutation({
    onSuccess: (table) => {
      utils.tables.list.invalidate({ project_id: projectId });
      router.push(`/notes/tables/${table.id}`);
    },
  });

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
          <Table2 size={10} />
          Tables
          {tables.length > 0 && (
            <span className="ml-0.5 font-mono text-3xs tabular-nums">({tables.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => createTable.mutate({ name: "Untitled table", project_id: projectId })}
          disabled={createTable.isPending}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
        >
          <Plus size={10} />
          New table
        </button>
      </div>

      {isLoading ? (
        <p className="py-2 font-ui text-2xs text-text-tertiary">Loading tables…</p>
      ) : tables.length === 0 ? (
        <p className="py-2 font-ui text-2xs text-text-tertiary">
          No tables yet.{" "}
          <button
            type="button"
            onClick={() => createTable.mutate({ name: "Untitled table", project_id: projectId })}
            className="text-accent-primary hover:underline"
          >
            Create one
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-px">
          {tables.map((table) => (
            <Link
              key={table.id}
              href={`/notes/tables/${table.id}`}
              className={cn(
                "group flex items-center gap-2 rounded-sm px-2 py-1.5 font-ui text-sm transition-colors",
                "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              <Table2 size={12} className="shrink-0 text-text-disabled group-hover:text-text-tertiary" />
              <span className="flex-1 truncate">{table.name}</span>
              <span className="shrink-0 font-mono text-3xs text-text-disabled tabular-nums">
                {table.row_count} rows
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

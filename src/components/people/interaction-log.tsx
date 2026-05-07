"use client";

import React, { useState } from "react";
import { Activity, ChevronDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useLocale } from "@/core/locale/hooks";
import { formatDateTime } from "@/core/locale/formatters";
import { cn } from "@/lib/utils";
import { LogInteractionModal, kindIcon, type InteractionRow } from "./log-interaction-modal";

interface Props {
  personId: string;
  personName: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function InteractionEntry({
  row,
  personId,
  personName,
  onDeleted,
}: {
  row: InteractionRow;
  personId: string;
  personName: string;
  onDeleted: () => void;
}) {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const utils = trpc.useUtils();
  const removeMutation = trpc.people.interactions.remove.useMutation({
    onSuccess: () => {
      void utils.people.interactions.list.invalidate({ person_id: personId });
      void utils.people.get.invalidate({ id: personId });
      onDeleted();
    },
  });

  const notes = row.notes ?? "";
  const lines = notes.split("\n");
  const isLong = lines.length > 3 || notes.length > 180;
  const previewNotes = isLong && !expanded ? lines.slice(0, 3).join("\n") : notes;

  return (
    <>
      <div className="relative group rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 hover:border-border-default transition-colors">
        <div className="flex items-start gap-3">
          {/* Kind icon */}
          <span className="mt-0.5 shrink-0 text-text-tertiary">{kindIcon(row.kind)}</span>

          <div className="flex-1 min-w-0">
            {/* Header line */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-text-primary capitalize">{row.kind}</span>
              <span className="text-xs text-text-tertiary">
                {formatDateTime(row.occurred_at, locale)}
              </span>
              {row.duration_minutes != null && (
                <span className="text-xs text-text-disabled">{formatDuration(row.duration_minutes)}</span>
              )}
              {row.location && (
                <span className="text-xs text-text-disabled truncate max-w-[160px]">{row.location}</span>
              )}
            </div>

            {/* Notes preview */}
            {notes && (
              <div className="mt-1.5">
                <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {previewNotes}
                  {isLong && !expanded && "…"}
                </p>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-xs text-text-tertiary hover:text-text-primary mt-0.5 transition-colors"
                  >
                    {expanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Overflow menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-text-disabled hover:text-text-primary hover:bg-surface-hover transition-colors",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-dropdown w-36 rounded-lg border border-border-default bg-surface-raised shadow-2 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
                  onClick={() => { setMenuOpen(false); setEditOpen(true); }}
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent-danger hover:bg-surface-hover transition-colors"
                  onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }}
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editOpen && (
        <LogInteractionModal
          personId={personId}
          personName={personName}
          existing={row}
          onClose={() => setEditOpen(false)}
          onSuccess={() => setEditOpen(false)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-surface-base/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border-default bg-surface-raised p-5 shadow-2 mx-4">
            <h3 className="font-semibold text-text-primary mb-2">Delete this interaction?</h3>
            <p className="text-sm text-text-tertiary mb-4">
              This will remove the interaction. The last-contacted date will be recomputed
              from remaining interactions.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-border-default text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate({ id: row.id })}
                className="px-3 py-1.5 text-sm rounded-md bg-accent-danger text-white hover:opacity-90 disabled:opacity-60"
              >
                {removeMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function InteractionLog({ personId, personName }: Props) {
  const [logOpen, setLogOpen] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    refetch,
  } = trpc.people.interactions.list.useInfiniteQuery(
    { person_id: personId, limit: 20 },
    { getNextPageParam: (page) => page.nextCursor },
  );

  const allInteractions = data?.pages.flatMap((p) => p.interactions) ?? [];

  return (
    <div>
      {isLoading ? (
        <div className="text-sm text-text-tertiary py-6 text-center">Loading…</div>
      ) : allInteractions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle bg-surface-sunken px-4 py-8 text-center">
          <Activity size={22} className="mx-auto mb-2 text-text-disabled" />
          <p className="text-sm text-text-tertiary mb-3">No interactions logged yet.</p>
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="text-sm text-accent-primary hover:underline"
          >
            + Log your first interaction
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end mb-1">
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="text-xs text-text-tertiary hover:text-text-primary border border-border-subtle rounded-md px-2.5 py-1 transition-colors"
            >
              + Log interaction
            </button>
          </div>
          {allInteractions.map((row) => (
            <InteractionEntry
              key={row.id}
              row={row as InteractionRow}
              personId={personId}
              personName={personName}
              onDeleted={() => void refetch()}
            />
          ))}
          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs text-text-tertiary hover:text-text-primary border border-dashed border-border-subtle rounded-md transition-colors"
            >
              <ChevronDown size={12} /> Load older
            </button>
          )}
        </div>
      )}

      {logOpen && (
        <LogInteractionModal
          personId={personId}
          personName={personName}
          onClose={() => setLogOpen(false)}
          onSuccess={() => setLogOpen(false)}
        />
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Star } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const PURPOSE_LABELS: Record<string, string> = {
  note: "Note",
  meeting_note: "Meeting",
  project_brief: "Brief",
  reading_note: "Reading",
};

export function ProjectNotesSection({ projectId }: { projectId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notes.list.useQuery({
    project_id: projectId,
    limit: 200,
  });

  const createNote = trpc.notes.create.useMutation({
    onSuccess: (note) => {
      utils.notes.list.invalidate({ project_id: projectId });
      router.push(`/notes/${note.id}`);
    },
  });

  const notes = data?.notes ?? [];
  const hasMore = !!data?.nextCursor;

  function handleNewNote() {
    createNote.mutate({
      title: "",
      project_id: projectId,
      purpose: "note",
    });
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
          <FileText size={10} />
          Notes
          {notes.length > 0 && (
            <span className="ml-0.5 font-mono text-3xs tabular-nums">({notes.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleNewNote}
          disabled={createNote.isPending}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
        >
          <Plus size={10} />
          New note
        </button>
      </div>

      {isLoading ? (
        <p className="py-2 font-ui text-2xs text-text-tertiary">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="py-2 font-ui text-2xs text-text-tertiary">
          No notes yet.{" "}
          <button
            type="button"
            onClick={handleNewNote}
            className="text-accent-primary hover:underline"
          >
            Create one
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-px">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className={cn(
                "group flex items-center gap-2 rounded-sm px-2 py-1.5 font-ui text-sm transition-colors",
                "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {note.is_project_brief ? (
                <Star size={12} className="shrink-0 text-amber-500" aria-label="Project brief" />
              ) : (
                <FileText
                  size={12}
                  className="shrink-0 text-text-disabled group-hover:text-text-tertiary"
                />
              )}
              <span className="flex-1 truncate">{note.title || "Untitled note"}</span>
              {note.purpose && note.purpose !== "note" && (
                <span className="shrink-0 rounded-sm bg-surface-sunken px-1 py-0.5 font-ui text-3xs text-text-tertiary">
                  {PURPOSE_LABELS[note.purpose] ?? note.purpose}
                </span>
              )}
            </Link>
          ))}
          {hasMore && (
            <Link
              href="/notes"
              className="mt-1 flex items-center gap-1 rounded-sm px-2 py-1 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              View all notes in Notes module →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

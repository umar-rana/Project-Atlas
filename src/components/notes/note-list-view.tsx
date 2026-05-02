"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NoteCard } from "./note-card";
import { PurposeTemplatePicker } from "./purpose-template-picker";
import { cn } from "@/lib/utils";

const PURPOSE_VALUES = ["note", "meeting_note", "project_brief", "reading_note"] as const;
type PurposeFilter = typeof PURPOSE_VALUES[number];

interface NoteListViewProps {
  title: string;
  folderId?: string | null;
  purpose?: PurposeFilter | null;
  projectId?: string | null;
}

export function NoteListView({ title, folderId, purpose, projectId }: NoteListViewProps): React.ReactElement {
  const [search, setSearch] = React.useState("");
  const [showPicker, setShowPicker] = React.useState(false);

  const notesQuery = trpc.notes.list.useQuery(
    {
      folder_id: folderId ?? undefined,
      project_id: projectId ?? undefined,
      purpose: purpose ?? undefined,
      limit: 100,
    },
    { enabled: !search },
  );

  const searchQuery = trpc.search.notes.useQuery(
    { query: search, limit: 50 },
    { enabled: search.length >= 2 },
  );

  const rawNotes = search.length >= 2
    ? (searchQuery.data ?? [])
    : (notesQuery.data?.notes ?? []);

  const notes = search.length >= 2 && purpose
    ? rawNotes.filter((n) => n.purpose === purpose)
    : rawNotes;

  const projectIds = Array.from(
    new Set(
      notes
        .map((n) => ("project_id" in n ? (n as { project_id: string | null }).project_id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const projectsQuery = trpc.projects.list.useQuery(
    { status: "active" },
    { enabled: projectIds.length > 0 },
  );
  const projectMap = new Map((projectsQuery.data ?? []).map((p) => [p.id, p.title]));

  const isLoading = search.length >= 2 ? searchQuery.isLoading : notesQuery.isLoading;

  if (showPicker) {
    return (
      <PurposeTemplatePicker
        folderId={folderId}
        projectId={projectId}
        defaultPurpose={purpose ?? undefined}
        onCancel={() => setShowPicker(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h1 className="font-ui text-base font-semibold text-text-primary">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled" />
            <input
              type="text"
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 rounded-md border border-border-default bg-surface-base pl-7 pr-3 font-ui text-xs text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent",
              "hover:bg-accent-primary-hover",
            )}
          >
            <Plus size={13} />
            New note
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="font-ui text-sm text-text-disabled">Loading…</span>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="font-ui text-sm text-text-tertiary">
              {search.length >= 2 ? `No results for "${search}"` : "No notes yet"}
            </p>
            {search.length < 2 && (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="font-ui text-xs text-accent-primary hover:underline"
              >
                Create your first note
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                id={note.id}
                title={note.title}
                purpose={note.purpose}
                is_project_brief={Boolean(note.is_project_brief)}
                body_text={note.body_text ?? ""}
                project_id={note.project_id ?? null}
                projectTitle={note.project_id ? (projectMap.get(note.project_id) ?? null) : null}
                updated_at={note.updated_at}
                folderId={note.folder_id ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

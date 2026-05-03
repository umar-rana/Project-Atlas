"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NotesShell } from "@/components/notes/notes-shell";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteMetadataPanel } from "@/components/notes/note-metadata-panel";

export default function NoteEditorPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const router = useRouter();

  const noteQuery = trpc.notes.get.useQuery({ id: noteId });
  const note = noteQuery.data;

  const metaPanel = note ? (
    <NoteMetadataPanel
      noteId={note.id}
      noteTitle={note.title}
      purpose={note.purpose as "note" | "meeting_note" | "project_brief" | "reading_note"}
      is_project_brief={note.is_project_brief}
      folder_id={note.folder_id ?? null}
      project_id={note.project_id ?? null}
      created_at={note.created_at}
      updated_at={note.updated_at}
    />
  ) : null;

  return (
    <NotesShell rightPanel={metaPanel}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft size={13} />
            Back
          </button>
        </div>

        {noteQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-ui text-sm text-text-disabled">Loading…</span>
          </div>
        ) : noteQuery.error || !note ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="font-ui text-sm text-text-tertiary">Note not found.</p>
          </div>
        ) : (
          <NoteEditor
            noteId={note.id}
            initialJson={note.body_json}
            initialTitle={note.title}
            className="flex-1"
          />
        )}
      </div>
    </NotesShell>
  );
}

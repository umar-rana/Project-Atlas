"use client";

import { useParams } from "next/navigation";
import { NotesShell } from "@/components/notes/notes-shell";
import { NoteListView } from "@/components/notes/note-list-view";

export default function NotesFolderPage() {
  const { folderId } = useParams<{ folderId: string }>();

  return (
    <NotesShell>
      <NoteListView title="Folder" folderId={folderId} />
    </NotesShell>
  );
}

import { NotesShell } from "@/components/notes/notes-shell";
import { NoteListView } from "@/components/notes/note-list-view";

export const metadata = { title: "Notes — Atlas" };

export default function NotesPage() {
  return (
    <NotesShell>
      <NoteListView title="All notes" />
    </NotesShell>
  );
}

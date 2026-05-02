"use client";

import { useParams } from "next/navigation";
import { NotesShell } from "@/components/notes/notes-shell";
import { NoteListView } from "@/components/notes/note-list-view";

const PURPOSE_LABELS: Record<string, string> = {
  note: "Notes",
  meeting_note: "Meeting Notes",
  project_brief: "Project Briefs",
  reading_note: "Reading Notes",
};

const PURPOSE_VALUES = ["note", "meeting_note", "project_brief", "reading_note"] as const;
type PurposeValue = typeof PURPOSE_VALUES[number];

export default function NotesPurposePage() {
  const { purpose } = useParams<{ purpose: string }>();
  const label = PURPOSE_LABELS[purpose] ?? purpose;
  const purposeFilter = PURPOSE_VALUES.includes(purpose as PurposeValue)
    ? (purpose as PurposeValue)
    : undefined;

  return (
    <NotesShell>
      <NoteListView title={label} purpose={purposeFilter} />
    </NotesShell>
  );
}

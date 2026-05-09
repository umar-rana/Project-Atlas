"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Camera, History } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NotesShell } from "@/components/notes/notes-shell";
import { NoteMetadataPanel } from "@/components/notes/note-metadata-panel";
import { SaveSnapshotDialog } from "@/components/notes/save-snapshot-dialog";

const NoteEditor = dynamic(
  () => import("@/components/notes/note-editor").then((m) => m.NoteEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-ui text-sm text-text-disabled">Loading editor…</span>
      </div>
    ),
  },
);

const VersionHistoryPanel = dynamic(
  () =>
    import("@/components/notes/version-history-panel").then((m) => m.VersionHistoryPanel),
  { ssr: false },
);
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/hint";

type ErrorBoundaryState = { error: Error | null };

class NoteEditorErrorBoundary extends React.Component<
  { children: React.ReactNode; onBack: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onBack: () => void }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="font-ui text-sm text-text-tertiary">
            Something went wrong loading the editor.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onBack();
            }}
            className="rounded-sm px-3 py-1.5 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            Go back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NoteEditorPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const router = useRouter();

  const noteQuery = trpc.notes.get.useQuery({ id: noteId });
  const note = noteQuery.data;

  const [saveSnapshotOpen, setSaveSnapshotOpen] = React.useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = React.useState(false);

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

          <div className="ml-auto flex items-center gap-1">
            {note && (
              <>
                <Hint label="Save snapshot" side="bottom">
                  <button
                    type="button"
                    onClick={() => setSaveSnapshotOpen(true)}
                    className="flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                  >
                    <Camera size={13} />
                  </button>
                </Hint>

                <Hint label="Note actions" side="bottom">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                        aria-label="Note actions"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setSaveSnapshotOpen(true)}>
                        <Camera size={13} className="mr-2" />
                        Save snapshot
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setVersionHistoryOpen(true)}>
                        <History size={13} className="mr-2" />
                        Version history
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Hint>
              </>
            )}
          </div>
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
          <NoteEditorErrorBoundary onBack={() => router.back()}>
            <NoteEditor
              noteId={note.id}
              initialJson={note.body_json}
              initialMarkdown={note.body_markdown ?? undefined}
              initialTitle={note.title}
              className="flex-1"
            />
          </NoteEditorErrorBoundary>
        )}
      </div>

      {note && (
        <>
          <SaveSnapshotDialog
            open={saveSnapshotOpen}
            onOpenChange={setSaveSnapshotOpen}
            noteId={note.id}
          />
          <VersionHistoryPanel
            open={versionHistoryOpen}
            onOpenChange={setVersionHistoryOpen}
            noteId={note.id}
            onRestored={() => {
              void noteQuery.refetch();
            }}
          />
        </>
      )}
    </NotesShell>
  );
}

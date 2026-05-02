"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { trpc } from "@/lib/trpc/client";
import { NoteMetadataPanel } from "./note-metadata-panel";
import { X } from "lucide-react";

interface NoteInspectorDialogProps {
  noteId: string;
  open: boolean;
  onClose: () => void;
}

export function NoteInspectorDialog({ noteId, open, onClose }: NoteInspectorDialogProps): React.ReactElement {
  const noteQuery = trpc.notes.get.useQuery({ id: noteId }, { enabled: open });

  const note = noteQuery.data;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm" hideClose className="flex h-[80vh] flex-col overflow-hidden p-0">
        <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate font-ui text-sm font-semibold text-text-primary">
              {note ? (note.title.trim() || "Untitled") : "Loading…"}
            </h2>
            {note ? (
              <p className="m-0 font-ui text-2xs text-text-tertiary capitalize">
                {note.purpose.replace(/_/g, " ")}
              </p>
            ) : null}
          </div>
          <DialogPrimitive.Close
            className="inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close inspector"
          >
            <X size={14} />
          </DialogPrimitive.Close>
        </header>
        <div className="flex-1 overflow-y-auto">
          {note ? (
            <NoteMetadataPanel
              noteId={note.id}
              purpose={note.purpose as "note" | "meeting_note" | "project_brief" | "reading_note"}
              is_project_brief={note.is_project_brief}
              folder_id={note.folder_id}
              project_id={note.project_id}
              created_at={note.created_at}
              updated_at={note.updated_at}
            />
          ) : (
            <div className="flex items-center justify-center py-12">
              <span className="font-ui text-sm text-text-disabled">Loading…</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

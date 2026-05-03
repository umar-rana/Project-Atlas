"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Star, ExternalLink, Trash2, FolderInput, Tag, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { NoteInspectorDialog } from "./note-inspector-dialog";

export const PURPOSE_LABELS: Record<string, string> = {
  note: "Note",
  meeting_note: "Meeting",
  project_brief: "Brief",
  reading_note: "Reading",
};

const PURPOSE_COLORS: Record<string, string> = {
  note: "bg-surface-raised text-text-secondary",
  meeting_note: "bg-cal-1-bg text-cal-1-border",
  project_brief: "bg-cal-5-bg text-cal-5-border",
  reading_note: "bg-cal-6-bg text-cal-6-border",
};

const PURPOSE_OPTIONS = ["note", "meeting_note", "project_brief", "reading_note"] as const;
type Purpose = typeof PURPOSE_OPTIONS[number];

interface NoteCardProps {
  id: string;
  title: string;
  purpose: string;
  is_project_brief: boolean;
  body_text: string;
  project_id: string | null;
  projectTitle?: string | null;
  updated_at: Date | string;
  folderId?: string | null;
  onDeleted?: () => void;
}

export function NoteCard({
  id,
  title,
  purpose,
  is_project_brief,
  body_text,
  project_id,
  projectTitle,
  updated_at,
  folderId,
  onDeleted,
}: NoteCardProps): React.ReactElement {
  const utils = trpc.useUtils();
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  const foldersQuery = trpc.notesFolder.list.useQuery(undefined, { enabled: false });

  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      onDeleted?.();
      toast.success("Note deleted");
    },
    onError: () => toast.error("Failed to delete note"),
  });

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      toast.success("Note updated");
    },
    onError: () => toast.error("Failed to update note"),
  });

  function handleChangePurpose(newPurpose: Purpose) {
    updateNote.mutate({ id, purpose: newPurpose });
  }

  function handleMoveToFolder(newFolderId: string | null) {
    updateNote.mutate({ id, folder_id: newFolderId });
  }

  function flattenFolders(
    nodes: { id: string; name: string; children: typeof nodes }[],
    depth = 0,
  ): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = [];
    for (const n of nodes) {
      out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
      out.push(...flattenFolders(n.children, depth + 1));
    }
    return out;
  }

  const flatFolders = flattenFolders(foldersQuery.data ?? []);

  const preview = body_text.trim().slice(0, 140);
  const dateStr = new Date(updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const displayTitle = title.trim() || "Untitled";

  return (
    <>
      <div className="group relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-base p-3 transition-colors hover:border-border-default hover:bg-surface-raised">
        <Link href={`/notes/${id}`} className="absolute inset-0 rounded-lg" aria-label={displayTitle} />

        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {is_project_brief && (
                <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
              )}
              <span className="truncate font-ui text-sm font-medium text-text-primary">{displayTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-ui text-2xs font-medium",
                  PURPOSE_COLORS[purpose] ?? PURPOSE_COLORS["note"],
                )}
              >
                {PURPOSE_LABELS[purpose] ?? purpose}
              </span>
              {projectTitle && (
                <span className="truncate font-ui text-2xs text-text-tertiary">
                  {is_project_brief ? "★ " : ""}{projectTitle}
                </span>
              )}
              <span className="ml-auto shrink-0 font-ui text-2xs text-text-disabled">{dateStr}</span>
            </div>
          </div>

          <div className="relative z-10 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) foldersQuery.refetch();
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                  aria-label="Note actions"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/notes/${id}`}>
                    <ExternalLink size={13} className="mr-2" />
                    Open
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectorOpen(true);
                  }}
                >
                  <PanelRight size={13} className="mr-2" />
                  Open in inspector
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tag size={13} className="mr-2" />
                    Change purpose
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    {PURPOSE_OPTIONS.map((p) => (
                      <DropdownMenuItem
                        key={p}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChangePurpose(p);
                        }}
                        className={cn(p === purpose && "font-semibold")}
                      >
                        {PURPOSE_LABELS[p]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput size={13} className="mr-2" />
                    Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveToFolder(null);
                      }}
                      className={cn(!folderId && "font-semibold")}
                    >
                      — No folder —
                    </DropdownMenuItem>
                    {flatFolders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveToFolder(f.id);
                        }}
                        className={cn(f.id === folderId && "font-semibold")}
                      >
                        {f.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-accent-danger focus:text-accent-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNote.mutate({ id });
                  }}
                  disabled={deleteNote.isPending}
                >
                  <Trash2 size={13} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {preview ? (
          <p className="line-clamp-2 font-ui text-xs text-text-tertiary">{preview}</p>
        ) : null}
      </div>

      <NoteInspectorDialog
        noteId={id}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />
    </>
  );
}

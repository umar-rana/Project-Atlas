"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictingNoteId: string;
  conflictingNoteTitle: string;
  suggestedTitle: string;
  onResolve: (resolution: "rename" | "replace" | "skip", resolvedTitle?: string) => void;
}

export function ImportConflictDialog({
  open,
  onOpenChange,
  conflictingNoteId,
  conflictingNoteTitle,
  suggestedTitle,
  onResolve,
}: ImportConflictDialogProps): React.ReactElement {
  const [resolution, setResolution] = React.useState<"rename" | "replace" | "skip">("rename");
  const [renameTitle, setRenameTitle] = React.useState(suggestedTitle);

  React.useEffect(() => {
    setRenameTitle(suggestedTitle);
    setResolution("rename");
  }, [suggestedTitle]);

  function handleConfirm() {
    if (resolution === "rename") {
      onResolve("rename", renameTitle);
    } else {
      onResolve(resolution);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-surface-base p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <Dialog.Title className="font-ui text-sm font-semibold text-text-primary">
                Note already exists
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-text-disabled hover:text-text-primary focus-visible:focus-ring"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          <p className="mb-4 font-ui text-xs text-text-secondary">
            A note named{" "}
            <strong className="text-text-primary">&ldquo;{conflictingNoteTitle}&rdquo;</strong>{" "}
            already exists. How would you like to proceed?
          </p>

          <div className="mb-4 flex flex-col gap-2">
            {/* Rename */}
            <button
              type="button"
              onClick={() => setResolution("rename")}
              className={cn(
                "flex flex-col gap-2 rounded-md border p-3 text-left transition-colors",
                resolution === "rename"
                  ? "bg-accent-primary-subtle/20 border-accent-primary"
                  : "border-border-default hover:border-border-focus",
              )}
            >
              <span className="font-ui text-xs font-medium text-text-primary">Rename import</span>
              {resolution === "rename" && (
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-border-default bg-surface-raised px-2 py-1.5 font-ui text-xs text-text-primary focus:border-border-focus focus:outline-none"
                  placeholder="New title"
                />
              )}
            </button>

            {/* Replace */}
            <button
              type="button"
              onClick={() => setResolution("replace")}
              className={cn(
                "flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors",
                resolution === "replace"
                  ? "border-accent-danger bg-red-500/10"
                  : "border-border-default hover:border-border-focus",
              )}
            >
              <span className="font-ui text-xs font-medium text-text-primary">
                Replace existing note
              </span>
              <span className="font-ui text-2xs text-text-disabled">
                The existing note will be moved to trash. This can be undone from the trash view.
              </span>
            </button>

            {/* Skip */}
            <button
              type="button"
              onClick={() => setResolution("skip")}
              className={cn(
                "flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors",
                resolution === "skip"
                  ? "bg-accent-primary-subtle/20 border-accent-primary"
                  : "border-border-default hover:border-border-focus",
              )}
            >
              <span className="font-ui text-xs font-medium text-text-primary">
                Skip this import
              </span>
              <span className="font-ui text-2xs text-text-disabled">
                Cancel the import and keep the existing note unchanged.
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={resolution === "rename" && !renameTitle.trim()}
              className="flex-1 rounded-md bg-accent-primary px-4 py-2 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring disabled:opacity-50"
            >
              {resolution === "rename"
                ? "Rename and import"
                : resolution === "replace"
                  ? "Replace and import"
                  : "Skip"}
            </button>
            <a
              href={`/notes/${conflictingNoteId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border-default px-4 py-2 font-ui text-xs text-text-secondary hover:bg-surface-raised focus-visible:focus-ring"
              onClick={() => onOpenChange(false)}
            >
              Open existing →
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

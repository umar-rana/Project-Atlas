"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Upload, CheckCircle, AlertTriangle, FileText, File } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ClaudeConversationDialog } from "./claude-conversation-dialog";
import { ImportConflictDialog } from "./import-conflict-dialog";

type ImportFormat = "md" | "docx";
type ImportStep = "idle" | "uploading" | "claude_choice" | "conflict" | "done" | "error";

interface ImportProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  format: ImportFormat;
  folderId?: string | null;
  projectId?: string | null;
}

export function ImportProgressDialog({
  open,
  onOpenChange,
  format,
  folderId,
  projectId,
}: ImportProgressDialogProps): React.ReactElement {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [step, setStep] = React.useState<ImportStep>("idle");
  const [progress, setProgress] = React.useState(0);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [createdNoteId, setCreatedNoteId] = React.useState<string | null>(null);

  // Claude dialog state
  const [showClaudeDialog, setShowClaudeDialog] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  // Conflict dialog state
  const [showConflictDialog, setShowConflictDialog] = React.useState(false);
  const [conflictData, setConflictData] = React.useState<{
    conflictingNoteId: string;
    conflictingNoteTitle: string;
    suggestedTitle: string;
    originalTitle: string;
  } | null>(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep("idle");
      setProgress(0);
      setWarnings([]);
      setError(null);
      setCreatedNoteId(null);
      setShowClaudeDialog(false);
      setPendingFile(null);
      setShowConflictDialog(false);
      setConflictData(null);
    }
  }, [open]);

  // Auto-open file picker when dialog opens
  React.useEffect(() => {
    if (open && step === "idle") {
      const timer = setTimeout(() => {
        inputRef.current?.click();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, step]);

  async function doImport(
    file: File,
    claudeMode?: string,
    conflictResolution?: string,
    newTitle?: string,
    conflictingNoteId?: string,
  ) {
    setStep("uploading");
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("source_format", format);
    if (folderId) formData.append("folder_id", folderId);
    if (projectId) formData.append("project_id", projectId);
    if (claudeMode) formData.append("claude_mode", claudeMode);
    if (conflictResolution) formData.append("conflict_resolution", conflictResolution);
    if (newTitle) formData.append("new_title", newTitle);
    if (conflictingNoteId) formData.append("conflicting_note_id", conflictingNoteId);

    setProgress(30);

    try {
      const res = await fetch("/api/convert/import", {
        method: "POST",
        body: formData,
      });
      setProgress(80);

      const data = (await res.json()) as {
        requiresClaudeDialog?: boolean;
        requiresConflictResolution?: boolean;
        conflictingNoteId?: string;
        conflictingNoteTitle?: string;
        suggestedTitle?: string;
        title?: string;
        skipped?: boolean;
        note?: { id: string; title: string };
        warnings?: string[];
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setStep("error");
        return;
      }

      if (data.requiresClaudeDialog) {
        setPendingFile(file);
        setShowClaudeDialog(true);
        setStep("claude_choice");
        return;
      }

      if (data.requiresConflictResolution) {
        setPendingFile(file);
        setConflictData({
          conflictingNoteId: data.conflictingNoteId!,
          conflictingNoteTitle: data.conflictingNoteTitle!,
          suggestedTitle: data.suggestedTitle!,
          originalTitle: data.title!,
        });
        setShowConflictDialog(true);
        setStep("conflict");
        return;
      }

      if (data.skipped) {
        onOpenChange(false);
        toast.info("Import skipped — a note with that title already exists.");
        return;
      }

      setProgress(100);
      setWarnings(data.warnings ?? []);
      setCreatedNoteId(data.note?.id ?? null);
      setStep("done");
    } catch (err) {
      setError("Network error during import. Please try again.");
      setStep("error");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    doImport(file);
  }

  function handleClaudeDialogOpenChange(open: boolean) {
    if (!open) {
      // User dismissed without choosing — abort the import cleanly
      setShowClaudeDialog(false);
      setStep("idle");
      setPendingFile(null);
      onOpenChange(false);
    } else {
      setShowClaudeDialog(true);
    }
  }

  function handleClaudeChoice(mode: "single" | "assistant_only" | "plain") {
    setShowClaudeDialog(false);
    if (pendingFile) {
      doImport(pendingFile, mode);
    }
  }

  function handleConflictDialogOpenChange(open: boolean) {
    if (!open) {
      // User dismissed without resolving — abort the import cleanly
      setShowConflictDialog(false);
      setStep("idle");
      setPendingFile(null);
      setConflictData(null);
      onOpenChange(false);
    } else {
      setShowConflictDialog(true);
    }
  }

  function handleConflictResolution(
    resolution: "rename" | "replace" | "skip",
    resolvedTitle?: string,
  ) {
    setShowConflictDialog(false);
    if (pendingFile && conflictData) {
      if (resolution === "skip") {
        onOpenChange(false);
        toast.info("Import skipped.");
        return;
      }
      doImport(
        pendingFile,
        undefined,
        resolution,
        resolvedTitle ?? conflictData.suggestedTitle,
        conflictData.conflictingNoteId,
      );
    }
  }

  function handleNavigateToNote() {
    if (createdNoteId) {
      router.push(`/notes/${createdNoteId}`);
    }
    onOpenChange(false);
  }

  const accept = format === "md" ? ".md,.markdown" : ".docx";
  const formatLabel = format === "md" ? "Markdown" : "Word";
  const FormatIcon = format === "md" ? FileText : File;

  return (
    <>
      <Dialog.Root
        open={open && step !== "claude_choice" && step !== "conflict"}
        onOpenChange={onOpenChange}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-surface-base p-6 shadow-xl focus:outline-none">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="font-ui text-sm font-semibold text-text-primary">
                Import {formatLabel} file
              </Dialog.Title>
              {step !== "uploading" && (
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded p-1 text-text-disabled hover:text-text-primary focus-visible:focus-ring"
                    aria-label="Close"
                  >
                    <X size={14} />
                  </button>
                </Dialog.Close>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={handleFileSelect}
            />

            {step === "idle" && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary-subtle">
                  <FormatIcon size={24} className="text-accent-primary" />
                </div>
                <div className="text-center">
                  <p className="font-ui text-sm text-text-primary">
                    Select a {formatLabel} file to import
                  </p>
                  <p className="mt-1 font-ui text-2xs text-text-disabled">
                    {format === "md" ? "Maximum size: 5 MB" : "Maximum size: 50 MB"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-accent-primary px-4 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
                >
                  <Upload size={13} aria-hidden />
                  Choose file
                </button>
              </div>
            )}

            {step === "uploading" && (
              <div className="flex flex-col gap-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                  <p className="font-ui text-sm text-text-primary">Converting file…</p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-accent-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="font-ui text-2xs text-text-disabled">This may take a few seconds.</p>
              </div>
            )}

            {step === "done" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle size={20} className="shrink-0 text-accent-success" />
                  <p className="font-ui text-sm font-medium text-text-primary">
                    Import successful!
                  </p>
                </div>

                {warnings.length > 0 && (
                  <div className="rounded-md border border-accent-warning/30 bg-accent-warning/10 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-accent-warning" />
                      <div className="flex flex-col gap-1">
                        <p className="font-ui text-2xs font-medium text-accent-warning">Import notes:</p>
                        {warnings.map((w, i) => (
                          <p key={i} className="font-ui text-2xs text-accent-warning/80">
                            {w}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleNavigateToNote}
                    className="flex-1 rounded-md bg-accent-primary px-4 py-2 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
                  >
                    Open note →
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-md border border-border-default px-4 py-2 font-ui text-xs text-text-secondary hover:bg-surface-raised focus-visible:focus-ring"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col gap-4">
                <div className="rounded-md border border-accent-danger/30 bg-accent-danger/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-accent-danger" />
                    <p className="font-ui text-xs text-accent-danger">{error}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("idle");
                      setError(null);
                      setProgress(0);
                    }}
                    className="flex-1 rounded-md border border-border-default px-4 py-2 font-ui text-xs text-text-secondary hover:bg-surface-raised focus-visible:focus-ring"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-md border border-border-default px-4 py-2 font-ui text-xs text-text-secondary hover:bg-surface-raised focus-visible:focus-ring"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {showClaudeDialog && (
        <ClaudeConversationDialog
          open={showClaudeDialog}
          onOpenChange={handleClaudeDialogOpenChange}
          onChoice={handleClaudeChoice}
        />
      )}

      {showConflictDialog && conflictData && (
        <ImportConflictDialog
          open={showConflictDialog}
          onOpenChange={handleConflictDialogOpenChange}
          conflictingNoteId={conflictData.conflictingNoteId}
          conflictingNoteTitle={conflictData.conflictingNoteTitle}
          suggestedTitle={conflictData.suggestedTitle}
          onResolve={handleConflictResolution}
        />
      )}
    </>
  );
}

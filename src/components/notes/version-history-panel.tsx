"use client";

import * as React from "react";
import { History, RotateCcw, GitCompare, Check } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import { buildExtensions } from "@/core/editor/tiptap-config";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface VersionHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  onRestored?: () => void;
}

function formatVersionDate(date: Date | string): string {
  const d = new Date(date);
  return (
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function ReadOnlyTipTapPreview({ bodyJson }: { bodyJson: string }): React.ReactElement {
  const content = React.useMemo((): JSONContent | null => {
    if (!bodyJson || bodyJson === "{}") return null;
    try {
      const parsed = JSON.parse(bodyJson) as JSONContent;
      if (parsed.type === "doc" && Array.isArray(parsed.content) && parsed.content.length > 0) {
        return parsed;
      }
    } catch {
      // fall through
    }
    return null;
  }, [bodyJson]);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: false,
    immediatelyRender: false,
  });

  React.useEffect(() => {
    if (!editor || !content) return;
    editor.commands.setContent(content);
  }, [editor, content]);

  if (!content) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="font-ui text-sm text-text-disabled">Empty note</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <EditorContent
        editor={editor}
        className="note-editor-content prose prose-sm dark:prose-invert max-w-none focus:outline-none"
      />
    </div>
  );
}

export function VersionHistoryPanel({
  open,
  onOpenChange,
  noteId,
  onRestored,
}: VersionHistoryPanelProps): React.ReactElement {
  const utils = trpc.useUtils();
  const [selectedVersionNumber, setSelectedVersionNumber] = React.useState<number | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = React.useState(false);

  const listQuery = trpc.notes.versions.list.useQuery({ noteId }, { enabled: open });

  const versions = listQuery.data ?? [];
  const latestVersionNumber = versions[0]?.version_number ?? null;

  const getQuery = trpc.notes.versions.get.useQuery(
    { noteId, versionNumber: selectedVersionNumber! },
    { enabled: selectedVersionNumber !== null },
  );

  const restoreMutation = trpc.notes.versions.restore.useMutation({
    onSuccess() {
      toast.success("Version restored — a new version was created from this one.");
      void utils.notes.versions.list.invalidate({ noteId });
      void utils.notes.get.invalidate({ id: noteId });
      setRestoreConfirmOpen(false);
      setSelectedVersionNumber(null);
      onRestored?.();
    },
    onError(err) {
      toast.error(err.message ?? "Failed to restore version");
      setRestoreConfirmOpen(false);
    },
  });

  const selectedVersion =
    selectedVersionNumber !== null
      ? (versions.find((v) => v.version_number === selectedVersionNumber) ?? null)
      : null;

  const isCurrentVersion = selectedVersionNumber === latestVersionNumber;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent side="right" width={680}>
          <DrawerHeader>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <History size={15} className="shrink-0 text-text-tertiary" />
              <DrawerTitle>Version history</DrawerTitle>
              <Hint label="Coming soon" side="bottom">
                <button
                  type="button"
                  disabled
                  className="ml-4 flex cursor-not-allowed items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-2xs text-text-disabled opacity-50"
                >
                  <GitCompare size={12} />
                  Compare versions (coming soon)
                </button>
              </Hint>
            </div>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border-subtle">
              {listQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="font-ui text-xs text-text-disabled">Loading…</span>
                </div>
              ) : versions.length === 0 ? (
                <div className="flex flex-col gap-2 px-4 py-8 text-center">
                  <p className="font-ui text-xs text-text-tertiary">No versions yet.</p>
                  <p className="font-ui text-2xs text-text-disabled">
                    Versions are created automatically as you edit.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col py-2">
                  {versions.map((v) => {
                    const isCurrent = v.version_number === latestVersionNumber;
                    const isSelected = v.version_number === selectedVersionNumber;
                    return (
                      <li key={v.version_number}>
                        <button
                          type="button"
                          onClick={() => setSelectedVersionNumber(v.version_number)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors",
                            isSelected
                              ? "bg-surface-selected text-text-primary"
                              : "text-text-secondary hover:bg-surface-hover",
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-ui text-xs font-medium">
                              Version {v.version_number}
                            </span>
                            {isCurrent && (
                              <span className="flex items-center gap-0.5 rounded-full bg-accent-success-muted px-1.5 py-0.5 font-ui text-3xs font-medium text-accent-success">
                                <Check size={9} />
                                Current
                              </span>
                            )}
                          </div>
                          <span className="font-ui text-2xs text-text-disabled">
                            {formatVersionDate(v.created_at)}
                          </span>
                          {v.change_summary ? (
                            <span className="mt-0.5 line-clamp-2 font-ui text-2xs text-text-tertiary">
                              {v.change_summary}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-auto border-t border-border-subtle px-3 py-2 font-ui text-2xs text-text-disabled">
                Up to 50 versions are kept. Version 1 is always preserved.
              </p>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {selectedVersionNumber === null ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <div className="flex max-w-xs flex-col items-center gap-2 text-center">
                    <History size={28} className="text-text-disabled" />
                    <p className="font-ui text-sm text-text-tertiary">
                      Select a version to preview it
                    </p>
                    <p className="font-ui text-2xs text-text-disabled">
                      Versions are snapshots of your note at a point in time.
                    </p>
                  </div>
                </div>
              ) : getQuery.isLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <span className="font-ui text-sm text-text-disabled">Loading preview…</span>
                </div>
              ) : getQuery.data ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-ui text-xs font-medium text-text-primary">
                        Version {selectedVersionNumber}
                      </span>
                      {selectedVersion?.change_summary ? (
                        <span className="font-ui text-2xs text-text-tertiary">
                          {selectedVersion.change_summary}
                        </span>
                      ) : (
                        <span className="font-ui text-2xs text-text-disabled">Auto-snapshot</span>
                      )}
                    </div>
                    {!isCurrentVersion && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setRestoreConfirmOpen(true)}
                        disabled={restoreMutation.isPending}
                      >
                        <RotateCcw size={12} className="mr-1.5" />
                        Restore this version
                      </Button>
                    )}
                    {isCurrentVersion && (
                      <span className="flex items-center gap-1 font-ui text-xs text-accent-success">
                        <Check size={12} />
                        Current version
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <ReadOnlyTipTapPreview bodyJson={getQuery.data.body_json} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              Restoring will create a new version from this one. Your current version will be
              preserved in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={() => {
                if (selectedVersionNumber !== null) {
                  restoreMutation.mutate({
                    noteId,
                    versionNumber: selectedVersionNumber,
                  });
                }
              }}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

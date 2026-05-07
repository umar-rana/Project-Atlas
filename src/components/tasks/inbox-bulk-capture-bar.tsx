"use client";

import * as React from "react";
import { Archive, FileText, Trash2, X, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface InboxBulkCaptureBarProps {
  captureIds: string[];
  onClear: () => void;
}

type BulkDisposition = "task" | "note" | "someday" | "trash";

const DISPOSITION_OPTIONS: {
  value: BulkDisposition;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
}[] = [
  { value: "task", label: "Make all tasks", icon: <Archive size={12} /> },
  { value: "note", label: "Make all notes", icon: <FileText size={12} /> },
  {
    value: "someday",
    label: "Defer all to Someday",
    icon: <Archive size={12} className="text-accent-info" />,
  },
  { value: "trash", label: "Trash all", icon: <Trash2 size={12} />, danger: true },
];

const DISPOSITION_DESCRIPTIONS: Record<BulkDisposition, string> = {
  task: "Creates a task from each capture with default attributes.",
  note: "Creates a note from each capture with default attributes.",
  someday: "Moves each capture to your Someday / Maybe list.",
  trash: "Permanently removes these captures from your inbox.",
};

function ConfirmDialog({
  count,
  disposition,
  onConfirm,
  onCancel,
  isPending,
}: {
  count: number;
  disposition: BulkDisposition;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const option = DISPOSITION_OPTIONS.find((o) => o.value === disposition)!;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border-default bg-surface-overlay p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-ui text-base font-semibold text-text-primary">{option.label}</h3>
        <p className="mb-4 font-ui text-sm text-text-secondary">
          This will apply to <strong>{count}</strong> {count === 1 ? "capture" : "captures"}.{" "}
          {DISPOSITION_DESCRIPTIONS[disposition]}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={cn(
              "rounded-md px-3 py-1.5 font-ui text-sm font-medium disabled:opacity-50",
              disposition === "trash"
                ? "hover:bg-accent-danger/90 bg-accent-danger text-white"
                : "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover",
            )}
          >
            {isPending ? "Processing…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InboxBulkCaptureBar({
  captureIds,
  onClear,
}: InboxBulkCaptureBarProps): React.ReactElement | null {
  const utils = trpc.useUtils();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [pendingDisposition, setPendingDisposition] = React.useState<BulkDisposition | null>(null);

  const bulkProcess = trpc.capture.bulkProcess.useMutation({
    onSuccess: (data) => {
      toast.success(`Processed ${data.count} ${data.count === 1 ? "capture" : "captures"}`);
      onClear();
      utils.capture.listInbox.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.someday.invalidate();
      utils.tasks.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Bulk processing failed");
    },
  });

  if (captureIds.length === 0) return null;

  function handleDispositionSelect(d: BulkDisposition) {
    setDropdownOpen(false);
    setPendingDisposition(d);
  }

  function handleConfirm() {
    if (!pendingDisposition) return;
    bulkProcess.mutate({ capture_ids: captureIds, disposition: pendingDisposition });
    setPendingDisposition(null);
  }

  return (
    <>
      {pendingDisposition && (
        <ConfirmDialog
          count={captureIds.length}
          disposition={pendingDisposition}
          onConfirm={handleConfirm}
          onCancel={() => setPendingDisposition(null)}
          isPending={bulkProcess.isPending}
        />
      )}
      <div className="border-t border-border-subtle bg-surface-overlay px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-ui text-xs text-text-secondary">
            {captureIds.length} {captureIds.length === 1 ? "capture" : "captures"} selected
          </span>
          <div className="flex flex-1 items-center justify-end gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-sm border border-border-subtle bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
              >
                Process selected <ChevronDown size={11} />
              </button>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-md border border-border-default bg-surface-overlay py-1 shadow-lg">
                    {DISPOSITION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleDispositionSelect(opt.value)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 font-ui text-sm hover:bg-surface-hover",
                          opt.danger ? "text-accent-danger" : "text-text-secondary",
                        )}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear selection"
              className="inline-flex items-center justify-center rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

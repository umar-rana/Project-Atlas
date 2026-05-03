"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, FileDown, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";

type PageSize = "A4" | "Letter" | "Legal" | "A3";
type ExportStep = "options" | "generating" | "done" | "error";

interface ExportPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  noteTitle: string;
}

export function ExportPdfDialog({
  open,
  onOpenChange,
  noteId,
  noteTitle,
}: ExportPdfDialogProps): React.ReactElement {
  const [step, setStep] = React.useState<ExportStep>("options");
  const [pageSize, setPageSize] = React.useState<PageSize>("A4");
  const [includeAttachmentAppendix, setIncludeAttachmentAppendix] = React.useState(false);
  const [includeHeader, setIncludeHeader] = React.useState(true);
  const [includeFooter, setIncludeFooter] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = React.useState<string | null>(null);
  const [filename, setFilename] = React.useState<string>("note.pdf");

  const exportPdf = trpc.convert.exportPdf.useMutation({
    onSuccess(data) {
      setDownloadUrl(data.url);
      setFilename(data.filename);
      setStep("done");
      // Auto-trigger download
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename;
      a.click();
    },
    onError(err) {
      setError(err.message ?? "PDF export failed");
      setStep("error");
    },
  });

  React.useEffect(() => {
    if (open) {
      setStep("options");
      setError(null);
      setDownloadUrl(null);
    }
  }, [open]);

  function handleExport() {
    setStep("generating");
    setError(null);
    exportPdf.mutate({
      noteId,
      pageSize,
      embedImages: false,
      includeAttachmentAppendix,
      includeHeader,
      includeFooter,
    });
  }

  const PAGE_SIZES: PageSize[] = ["A4", "Letter", "Legal", "A3"];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-surface-base p-6 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="font-ui text-sm font-semibold text-text-primary">
              Export as PDF
            </Dialog.Title>
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

          {step === "options" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-ui text-2xs font-medium text-text-tertiary uppercase tracking-caps">
                  Page size
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPageSize(size)}
                      className={cn(
                        "rounded border px-2 py-1.5 font-ui text-2xs font-medium transition-colors",
                        pageSize === size
                          ? "border-accent-primary bg-accent-primary-subtle/20 text-accent-primary"
                          : "border-border-default text-text-secondary hover:border-border-focus",
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-ui text-2xs font-medium text-text-tertiary uppercase tracking-caps">
                  Options
                </label>
                {[
                  { key: "includeAttachmentAppendix", label: "List attachments at end", value: includeAttachmentAppendix, set: setIncludeAttachmentAppendix },
                  { key: "includeHeader", label: "Include header", value: includeHeader, set: setIncludeHeader },
                  { key: "includeFooter", label: "Include footer with page numbers", value: includeFooter, set: setIncludeFooter },
                ].map((opt) => (
                  <label key={opt.key} className="flex cursor-pointer items-center justify-between">
                    <span className="font-ui text-xs text-text-secondary">{opt.label}</span>
                    <button
                      type="button"
                      onClick={() => opt.set(!opt.value)}
                      className={cn(
                        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
                        opt.value
                          ? "border-accent-primary bg-accent-primary"
                          : "border-border-default bg-surface-raised",
                      )}
                    >
                      <span
                        className={cn(
                          "block size-3 rounded-full bg-white shadow transition-transform",
                          opt.value ? "translate-x-3.5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={handleExport}
                className="flex items-center justify-center gap-2 rounded-md bg-accent-primary px-4 py-2 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
              >
                <FileDown size={13} aria-hidden />
                Generate PDF
              </button>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 size={24} className="animate-spin text-accent-primary" />
              <p className="font-ui text-sm text-text-primary">Generating PDF…</p>
              <p className="font-ui text-2xs text-text-disabled">This may take a few seconds.</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="shrink-0 text-green-400" />
                <p className="font-ui text-sm font-medium text-text-primary">PDF ready!</p>
              </div>
              <p className="font-ui text-2xs text-text-disabled">
                Download started automatically. The PDF link is valid for 24 hours.
              </p>
              <div className="flex gap-2">
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={filename}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent-primary px-4 py-2 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
                  >
                    <FileDown size={13} aria-hidden />
                    Download again
                  </a>
                )}
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
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
                  <p className="font-ui text-xs text-red-300">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("options")}
                  className="flex-1 rounded-md bg-accent-primary px-4 py-2 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
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
  );
}

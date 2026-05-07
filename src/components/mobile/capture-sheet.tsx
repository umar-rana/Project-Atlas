"use client";

import * as React from "react";
import { Mic, Camera, Paperclip, X, Send, MicOff } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface CaptureSheetProps {
  open: boolean;
  onClose: () => void;
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: {
    results: { length: number; [k: number]: { [k: number]: { transcript: string } } };
  }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function CaptureSheet({ open, onClose }: CaptureSheetProps) {
  const [text, setText] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const startDragYRef = React.useRef(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const recognitionRef = React.useRef<{ stop: () => void } | null>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const [uploading, setUploading] = React.useState(false);
  const capture = trpc.capture.create.useMutation();

  React.useEffect(() => {
    if (open) {
      setDragY(0);
      setTimeout(() => textareaRef.current?.focus(), 120);
    } else {
      setText("");
      setAttachments([]);
      stopListening();
    }
  }, [open]);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function toggleVoice() {
    if (!speechSupported) return;
    if (listening) { stopListening(); return; }
    const w = window as unknown as Record<string, SpeechRecognitionCtor | undefined>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r) transcript += (r[0]?.transcript ?? "");
      }
      setText(transcript);
    };
    recognition.onerror = () => stopListening();
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => {
      const remaining = 5 - prev.length;
      if (remaining <= 0 || files.length > remaining) {
        toast.error(`Maximum 5 attachments allowed`);
      }
      return [...prev, ...files].slice(0, 5);
    });
    e.target.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || capture.isPending || uploading) return;

    try {
      setUploading(true);
      const result = await capture.mutateAsync({ raw_text: trimmed });

      if (attachments.length > 0) {
        await Promise.all(
          attachments.map(async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("parent_type", "Capture");
            fd.append("parent_id", result.id);
            await fetch("/api/attachments/upload", { method: "POST", body: fd });
          }),
        );
      }

      setText("");
      setAttachments([]);
      onClose();
      toast.success("Captured!", {
        action: { label: "View", onClick: () => (window.location.href = "/m/captures") },
        duration: 4000,
      });
    } catch {
      toast.error("Failed to save capture");
    } finally {
      setUploading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  }

  function handleBackdropClick() {
    if (text.trim()) {
      if (window.confirm("Discard this capture?")) onClose();
    } else {
      onClose();
    }
  }

  function handleDragStart(e: React.TouchEvent) {
    startDragYRef.current = e.touches[0]?.clientY ?? 0;
    setDragging(true);
  }

  function handleDragMove(e: React.TouchEvent) {
    if (!dragging) return;
    const delta = (e.touches[0]?.clientY ?? startDragYRef.current) - startDragYRef.current;
    if (delta > 0) setDragY(delta);
  }

  function handleDragEnd() {
    setDragging(false);
    if (dragY > 80) {
      setDragY(0);
      handleBackdropClick();
    } else {
      setDragY(0);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 w-full rounded-t-2xl bg-surface-base pb-[env(safe-area-inset-bottom)]",
          "shadow-xl",
          !dragging && "transition-transform duration-200",
        )}
        style={{ transform: `translateY(${dragY}px)` }}
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
      >
        <div
          className="flex touch-none flex-col items-center pb-1 pt-3"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div className="h-1 w-10 rounded-full bg-border-default" aria-hidden />
        </div>

        <div className="flex items-center justify-between px-4 pb-2">
          <p className="font-ui text-sm font-semibold text-text-primary">Quick Capture</p>
          <button
            type="button"
            aria-label="Close"
            onClick={handleBackdropClick}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-tertiary active:bg-surface-hover"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? "Listening…" : "What's on your mind?"}
            rows={4}
            className={cn(
              "w-full resize-none rounded-xl border bg-surface-raised px-3 py-2.5",
              "font-ui text-base text-text-primary placeholder:text-text-disabled",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary/30",
              "border-border-subtle",
              listening && "border-accent-danger ring-2 ring-accent-danger/30",
            )}
          />
        </div>

        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 px-4">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-2 py-1"
              >
                <span className="font-ui text-xs text-text-secondary">
                  {file.name.length > 20 ? file.name.slice(0, 20) + "…" : file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="text-text-tertiary active:text-accent-danger"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1 px-4 pb-4">
          {speechSupported && (
            <button
              type="button"
              aria-label={listening ? "Stop listening" : "Voice input"}
              onClick={toggleVoice}
              className={cn(
                "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors",
                listening
                  ? "bg-accent-danger/10 text-accent-danger"
                  : "bg-surface-raised text-text-secondary active:bg-surface-hover",
              )}
            >
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}

          <button
            type="button"
            aria-label="Take photo"
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-surface-raised text-text-secondary active:bg-surface-hover"
          >
            <Camera size={20} />
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden
          />

          <button
            type="button"
            aria-label="Attach file"
            disabled={attachments.length >= 5}
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-surface-raised text-text-secondary active:bg-surface-hover disabled:opacity-40"
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            aria-hidden
          />

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim() || capture.isPending || uploading}
            className={cn(
              "flex min-h-[44px] items-center gap-2 rounded-xl px-4 font-ui text-sm font-semibold transition-colors",
              "bg-accent-primary text-white active:bg-accent-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <Send size={16} />
            {uploading ? "Uploading…" : capture.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

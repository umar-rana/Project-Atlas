"use client";

import * as React from "react";

interface WorklogCreateFormProps {
  initialBody?: string;
  initialDurationMinutes?: number | null;
  onSave: (body: string, durationMinutes: number | null) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function WorklogCreateForm({
  initialBody = "",
  initialDurationMinutes,
  onSave,
  onCancel,
  saving,
}: WorklogCreateFormProps) {
  const [body, setBody] = React.useState(initialBody);
  const [durationRaw, setDurationRaw] = React.useState(
    initialDurationMinutes != null ? String(initialDurationMinutes) : "",
  );
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    const parsed = parseInt(durationRaw, 10);
    const duration = !isNaN(parsed) && parsed > 0 ? parsed : null;
    onSave(trimmed, duration);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a progress note…"
        rows={3}
        className="bg-bg-input w-full resize-none rounded border border-border-subtle px-2 py-1.5 font-ui text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-focus"
        disabled={saving}
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 font-ui text-xs text-text-secondary">
          <span className="shrink-0">Time spent (optional)</span>
          <input
            type="number"
            min={1}
            max={10080}
            value={durationRaw}
            onChange={(e) => setDurationRaw(e.target.value)}
            placeholder="0"
            className="bg-bg-input w-16 rounded border border-border-subtle px-2 py-1 font-ui text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-focus"
            disabled={saving}
          />
          <span className="shrink-0 text-text-tertiary">minutes</span>
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="hover:bg-bg-hover rounded px-2 py-1 font-ui text-xs text-text-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="bg-accent-primary rounded px-2 py-1 font-ui text-xs text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

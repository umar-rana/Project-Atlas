"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Monitor } from "lucide-react";
import { format } from "date-fns";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import { buildExtensions } from "@/core/editor/tiptap-config";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { switchToDesktop } from "@/lib/mobile/switch-to-desktop";

function ReadOnlyNoteContent({ bodyJson, bodyText }: { bodyJson?: string | null; bodyText?: string | null }) {
  const content = React.useMemo((): JSONContent | null => {
    if (!bodyJson || bodyJson === "{}" || bodyJson === "") return null;
    try {
      const parsed = JSON.parse(bodyJson) as JSONContent;
      if (parsed.type === "doc" && Array.isArray(parsed.content) && parsed.content.length > 0) {
        return parsed;
      }
    } catch {
      // fall through to body_text
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

  if (content && editor) {
    return (
      <EditorContent
        editor={editor}
        className="note-editor-content prose prose-sm dark:prose-invert max-w-none focus:outline-none"
      />
    );
  }

  if (bodyText) {
    return (
      <p className="whitespace-pre-wrap font-ui text-sm leading-relaxed text-text-secondary">
        {bodyText}
      </p>
    );
  }

  return <p className="font-ui text-sm italic text-text-disabled">No content</p>;
}

export default function MobileNoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();

  const { data: note, isLoading } = trpc.notes.get.useQuery({ id: noteId });

  function switchToDesktopEdit() {
    switchToDesktop(`/notes/${noteId}`);
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
          <Link
            href="/m/notes"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
          >
            <ChevronLeft size={22} />
          </Link>
          <div className="h-4 flex-1 animate-pulse rounded bg-surface-raised" />
        </header>
        <div className="flex-1 space-y-3 px-4 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-surface-raised"
              style={{ width: `${60 + (i % 4) * 10}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-ui text-base font-medium text-text-secondary">Note not found</p>
        <Link href="/m/notes" className="font-ui text-sm text-accent-primary">
          Back to notes
        </Link>
      </div>
    );
  }

  const updatedAt = format(new Date(note.updated_at), "MMMM d, yyyy");

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
        <Link
          href="/m/notes"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
          aria-label="Back to notes"
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="flex-1 truncate font-ui text-base font-semibold text-text-primary">
          {note.title || "Untitled"}
        </h1>
      </header>

      <div className="border-b border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={switchToDesktopEdit}
          className={cn(
            "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border-subtle",
            "bg-surface-raised font-ui text-sm font-medium text-text-secondary",
            "active:bg-surface-hover transition-colors",
          )}
        >
          <Monitor size={16} aria-hidden />
          Edit in desktop site
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 space-y-1">
          <h2 className="font-ui text-xl font-bold text-text-primary">{note.title || "Untitled"}</h2>
          <p className="font-ui text-xs text-text-tertiary">Updated {updatedAt}</p>
        </div>

        <ReadOnlyNoteContent bodyJson={note.body_json} bodyText={note.body_text} />
      </div>
    </div>
  );
}

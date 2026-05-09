"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import { buildExtensions } from "@/core/editor/tiptap-config";

interface Props {
  bodyJson?: string | null;
  bodyText?: string | null;
}

export default function ReadOnlyNoteContent({ bodyJson, bodyText }: Props) {
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

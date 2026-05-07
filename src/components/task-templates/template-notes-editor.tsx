"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { cn } from "@/lib/utils";

interface TemplateNotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TemplateNotesEditor({
  value,
  onChange,
  placeholder = "Optional notes body…",
  className,
}: TemplateNotesEditorProps): React.ReactElement {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        dropcursor: { color: "var(--color-accent-primary)", width: 2 },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: value ? parseContent(value) : "",
    editorProps: {
      attributes: {
        class: "min-h-[80px] focus:outline-none font-ui text-sm text-text-primary",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getText() ? ed.getHTML() : "");
    },
  });

  return (
    <div
      className={cn(
        "rounded-md border border-border-default bg-surface-raised px-3 py-2 focus-within:ring-2 focus-within:ring-border-focus",
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function parseContent(value: string): string {
  if (value.startsWith("<") || value.startsWith("{")) return value;
  const paragraphs = value.split(/\n{2,}/).filter(Boolean);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

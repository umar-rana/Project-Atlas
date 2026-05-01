"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: (editor: Editor) => void;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain text paragraph",
    icon: "¶",
    action: (editor) => editor.chain().focus().clearNodes().setParagraph().run(),
  },
  {
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    action: (editor) =>
      editor.chain().focus().clearNodes().setHeading({ level: 1 }).run(),
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    action: (editor) =>
      editor.chain().focus().clearNodes().setHeading({ level: 2 }).run(),
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    action: (editor) =>
      editor.chain().focus().clearNodes().setHeading({ level: 3 }).run(),
  },
  {
    id: "bulletList",
    label: "Bullet List",
    description: "Unordered list",
    icon: "•",
    action: (editor) =>
      editor.chain().focus().clearNodes().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    action: (editor) =>
      editor.chain().focus().clearNodes().toggleOrderedList().run(),
  },
  {
    id: "taskList",
    label: "Task List",
    description: "Interactive checkboxes",
    icon: "☐",
    action: (editor) =>
      editor.chain().focus().clearNodes().toggleTaskList().run(),
  },
  {
    id: "codeBlock",
    label: "Code Block",
    description: "Syntax-highlighted code",
    icon: "</>",
    action: (editor) =>
      editor.chain().focus().clearNodes().setCodeBlock().run(),
  },
  {
    id: "blockquote",
    label: "Blockquote",
    description: "Quoted text",
    icon: "❝",
    action: (editor) =>
      editor.chain().focus().clearNodes().setBlockquote().run(),
  },
  {
    id: "horizontalRule",
    label: "Divider",
    description: "Horizontal line",
    icon: "—",
    action: (editor) =>
      editor.chain().focus().setHorizontalRule().run(),
  },
];

type Props = {
  query: string;
  position: { top: number; left: number };
  editor: Editor;
  from: number;
  onClose: () => void;
};

export function SlashCommandMenu({ query, position, editor, from, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      const triggerLength = 1 + query.length;
      editor
        .chain()
        .focus()
        .deleteRange({ from: from, to: from + triggerLength })
        .run();
      cmd.action(editor);
      onClose();
    },
    [editor, from, query, onClose],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const cmd = filtered[activeIndex];
        if (cmd) executeCommand(cmd);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, filtered, executeCommand, onClose]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (filtered.length === 0) {
    return (
      <div
        style={{ top: position.top, left: position.left }}
        className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-3 text-sm text-muted-foreground"
      >
        No commands found
      </div>
    );
  }

  return (
    <div
      style={{ top: position.top, left: position.left }}
      className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[240px] max-w-[320px]"
    >
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-muted/50">
        Commands
        {query && <span className="ml-1 opacity-60">&ldquo;{query}&rdquo;</span>}
      </div>
      <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
        {filtered.map((cmd, i) => (
          <li key={cmd.id}>
            <button
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-accent transition-colors",
                i === activeIndex && "bg-accent",
              )}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => executeCommand(cmd)}
            >
              <span className="w-7 h-7 flex items-center justify-center text-xs font-mono bg-muted rounded flex-shrink-0">
                {cmd.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{cmd.label}</div>
                <div className="text-xs text-muted-foreground">{cmd.description}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

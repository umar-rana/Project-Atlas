"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";

type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "codeBlock"
  | "blockquote";

const TURN_INTO_OPTIONS: { id: BlockType; label: string; icon: string }[] = [
  { id: "paragraph", label: "Text", icon: "¶" },
  { id: "heading1", label: "Heading 1", icon: "H1" },
  { id: "heading2", label: "Heading 2", icon: "H2" },
  { id: "heading3", label: "Heading 3", icon: "H3" },
  { id: "bulletList", label: "Bullet List", icon: "•" },
  { id: "orderedList", label: "Numbered List", icon: "1." },
  { id: "taskList", label: "Task List", icon: "☐" },
  { id: "codeBlock", label: "Code Block", icon: "</>" },
  { id: "blockquote", label: "Quote", icon: "❝" },
];

const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Purple", value: "#e9d5ff" },
];

function applyHighlightToBlock(editor: Editor, pos: number, color: string | null) {
  const { state } = editor;
  try {
    const safePos = Math.max(0, Math.min(pos, state.doc.content.size - 1));
    const $pos = state.doc.resolve(safePos);
    const depth = Math.min(1, $pos.depth);
    const from = $pos.start(depth);
    const to = $pos.end(depth);
    if (color === null) {
      editor.chain().focus().setTextSelection({ from, to }).unsetHighlight().run();
    } else {
      editor.chain().focus().setTextSelection({ from, to }).toggleHighlight({ color }).run();
    }
  } catch {
    // pos out of range — silently skip
  }
}

function applyBlockType(editor: Editor, type: BlockType) {
  const chain = editor.chain().focus();
  switch (type) {
    case "paragraph":
      chain.clearNodes().setParagraph().run();
      break;
    case "heading1":
      chain.clearNodes().setHeading({ level: 1 }).run();
      break;
    case "heading2":
      chain.clearNodes().setHeading({ level: 2 }).run();
      break;
    case "heading3":
      chain.clearNodes().setHeading({ level: 3 }).run();
      break;
    case "bulletList":
      chain.clearNodes().toggleBulletList().run();
      break;
    case "orderedList":
      chain.clearNodes().toggleOrderedList().run();
      break;
    case "taskList":
      chain.clearNodes().toggleTaskList().run();
      break;
    case "codeBlock":
      chain.clearNodes().setCodeBlock().run();
      break;
    case "blockquote":
      chain.clearNodes().setBlockquote().run();
      break;
  }
}

type Props = {
  editor: Editor;
  pos: number;
  anchor: { x: number; y: number };
  onClose: () => void;
};

type SubMenu = "turnInto" | "color" | null;

export function EditorBlockMenu({ editor, pos, anchor, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = React.useState<SubMenu>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  function focusBlock() {
    editor.commands.setTextSelection(pos);
    editor.commands.focus();
  }

  function handleDuplicate() {
    focusBlock();
    const { state } = editor;
    const { $from } = state.selection;
    const node = $from.node($from.depth);
    if (!node) {
      onClose();
      return;
    }
    const end = $from.end($from.depth);
    editor
      .chain()
      .focus()
      .insertContentAt(end + 1, node.toJSON() as object)
      .run();
    onClose();
  }

  function handleDelete() {
    focusBlock();
    editor.chain().focus().deleteCurrentNode().run();
    onClose();
  }

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: anchor.y,
    left: anchor.x,
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="min-w-[180px] rounded-lg border border-border-default bg-surface-raised py-1 text-sm shadow-2"
    >
      <div className="relative">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          onMouseEnter={() => setSubMenu("turnInto")}
        >
          <span>Turn into</span>
          <span className="text-xs text-text-tertiary">▶</span>
        </button>
        {subMenu === "turnInto" && (
          <div
            className="absolute left-full top-0 ml-1 min-w-[160px] rounded-lg border border-border-default bg-surface-raised py-1 shadow-2"
            onMouseLeave={() => setSubMenu(null)}
          >
            {TURN_INTO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={() => {
                  focusBlock();
                  applyBlockType(editor, opt.id);
                  onClose();
                }}
              >
                <span className="w-5 text-center font-mono text-xs text-text-tertiary">
                  {opt.icon}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          onMouseEnter={() => setSubMenu("color")}
        >
          <span>Color</span>
          <span className="text-xs text-text-tertiary">▶</span>
        </button>
        {subMenu === "color" && (
          <div
            className="absolute left-full top-0 ml-1 rounded-lg border border-border-default bg-surface-raised p-2.5 shadow-2"
            onMouseLeave={() => setSubMenu(null)}
          >
            <p className="mb-1.5 text-xs font-medium text-text-tertiary">Highlight</p>
            <div className="flex flex-wrap gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  onClick={() => {
                    applyHighlightToBlock(editor, pos, c.value);
                    onClose();
                  }}
                  className="h-6 w-6 rounded border-2 border-transparent transition-all hover:scale-110 hover:border-accent-primary focus-visible:focus-ring"
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <button
                type="button"
                title="Remove highlight"
                onClick={() => {
                  applyHighlightToBlock(editor, pos, null);
                  onClose();
                }}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded border-2 border-border-default",
                  "text-[10px] text-text-tertiary hover:border-accent-primary focus-visible:focus-ring",
                )}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="flex w-full items-center px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        onMouseEnter={() => setSubMenu(null)}
        onClick={handleDuplicate}
      >
        Duplicate
      </button>

      <div className="my-1 h-px bg-border-subtle" />

      <button
        type="button"
        className="flex w-full items-center px-3 py-1.5 text-accent-danger hover:bg-accent-danger-muted"
        onMouseEnter={() => setSubMenu(null)}
        onClick={handleDelete}
      >
        Delete
      </button>
    </div>
  );
}

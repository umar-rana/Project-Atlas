"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { cn } from "@/lib/utils";

type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "blockquote";

const BLOCK_TYPES: { id: BlockType; label: string; icon: string }[] = [
  { id: "paragraph", label: "Text", icon: "¶" },
  { id: "heading1", label: "Heading 1", icon: "H1" },
  { id: "heading2", label: "Heading 2", icon: "H2" },
  { id: "heading3", label: "Heading 3", icon: "H3" },
  { id: "bulletList", label: "Bullet List", icon: "•" },
  { id: "orderedList", label: "Numbered List", icon: "1." },
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
  { label: "None", value: null },
];

const TEXT_COLORS = [
  { label: "Default", value: null },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#ca8a04" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#9333ea" },
  { label: "Pink", value: "#db2777" },
  { label: "Gray", value: "#6b7280" },
];

function getActiveBlockType(editor: Editor): BlockType {
  if (editor.isActive("heading", { level: 1 })) return "heading1";
  if (editor.isActive("heading", { level: 2 })) return "heading2";
  if (editor.isActive("heading", { level: 3 })) return "heading3";
  if (editor.isActive("bulletList")) return "bulletList";
  if (editor.isActive("orderedList")) return "orderedList";
  if (editor.isActive("codeBlock")) return "codeBlock";
  if (editor.isActive("blockquote")) return "blockquote";
  return "paragraph";
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
    case "codeBlock":
      chain.clearNodes().setCodeBlock().run();
      break;
    case "blockquote":
      chain.clearNodes().setBlockquote().run();
      break;
  }
}

type ToolbarButtonProps = {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
};

function ToolbarButton({ active, onClick, title, children, className }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

type LinkEditorProps = {
  editor: Editor;
  onClose: () => void;
};

function LinkEditor({ editor, onClose }: LinkEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentHref = editor.getAttributes("link").href as string | undefined;
  const [value, setValue] = useState(currentHref ?? "");

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const apply = useCallback(() => {
    const href = value.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    onClose();
  }, [editor, value, onClose]);

  return (
    <div className="flex items-center gap-1.5 px-2">
      <input
        ref={inputRef}
        type="url"
        placeholder="https://…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") onClose();
        }}
        className="h-7 w-52 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={apply}
        className="h-7 rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Apply
      </button>
      {currentHref && (
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onClose();
          }}
          className="h-7 rounded px-2 text-xs text-destructive hover:bg-destructive/10"
        >
          Remove
        </button>
      )}
    </div>
  );
}

type BlockDropdownProps = {
  editor: Editor;
  onClose: () => void;
};

function BlockDropdown({ editor, onClose }: BlockDropdownProps) {
  const active = getActiveBlockType(editor);
  return (
    <div className="py-1">
      {BLOCK_TYPES.map((bt) => (
        <button
          key={bt.id}
          type="button"
          onClick={() => {
            applyBlockType(editor, bt.id);
            onClose();
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
            active === bt.id && "bg-accent font-medium",
          )}
        >
          <span className="w-6 text-center text-xs font-mono text-muted-foreground">
            {bt.icon}
          </span>
          {bt.label}
        </button>
      ))}
    </div>
  );
}

type ColorPopoverProps = {
  editor: Editor;
  onClose: () => void;
};

function ColorPopover({ editor, onClose }: ColorPopoverProps) {
  const activeHighlight = editor.getAttributes("highlight").color as string | undefined;
  const activeTextColor = editor.getAttributes("textStyle").color as string | undefined;

  return (
    <div className="flex flex-col gap-3 p-2.5">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Text colour</p>
        <div className="flex flex-wrap gap-1.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onClick={() => {
                if (!c.value) {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(c.value).run();
                }
                onClose();
              }}
              className={cn(
                "h-6 w-6 rounded border-2 transition-all hover:scale-110",
                c.value === null
                  ? "border-border bg-transparent text-[10px] text-muted-foreground"
                  : activeTextColor === c.value
                  ? "border-primary"
                  : "border-transparent",
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
            >
              {c.value === null && "A"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Highlight</p>
        <div className="flex flex-wrap gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onClick={() => {
                if (!c.value) {
                  editor.chain().focus().unsetHighlight().run();
                } else {
                  editor.chain().focus().toggleHighlight({ color: c.value }).run();
                }
                onClose();
              }}
              className={cn(
                "h-6 w-6 rounded border-2 transition-all hover:scale-110",
                c.value === null
                  ? "border-border bg-transparent text-[10px] text-muted-foreground"
                  : activeHighlight === c.value
                  ? "border-primary"
                  : "border-transparent",
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
            >
              {c.value === null && "✕"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type Mode = "toolbar" | "link" | "block" | "color";

type Props = {
  editor: Editor;
};

function shouldShow({
  editor,
  state,
}: {
  editor: Editor;
  element: HTMLElement;
  view: EditorView;
  state: EditorState;
  oldState?: EditorState;
  from: number;
  to: number;
}): boolean {
  if (!state || state.selection.empty) return false;
  if (editor.isActive("image")) return false;
  if (editor.isActive("codeBlock")) return false;
  return true;
}

export function EditorBubbleMenu({ editor }: Props) {
  const [mode, setMode] = useState<Mode>("toolbar");

  const closePopover = useCallback(() => setMode("toolbar"), []);

  const activeBlock = getActiveBlockType(editor);
  const activeBlockDef = BLOCK_TYPES.find((b) => b.id === activeBlock);
  const activeHighlight = editor.getAttributes("highlight").color as string | undefined;

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", flip: true }}
      shouldShow={shouldShow}
    >
      <div className="flex items-center rounded-lg border border-border bg-popover shadow-lg">
        {mode === "toolbar" && (
          <>
            <button
              type="button"
              title="Block type"
              onClick={() => setMode("block")}
              className={cn(
                "flex h-7 items-center gap-1 rounded-l-lg px-2 text-xs font-medium transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                "border-r border-border",
              )}
            >
              <span className="font-mono">{activeBlockDef?.icon ?? "¶"}</span>
              <span className="max-w-[60px] truncate">{activeBlockDef?.label ?? "Text"}</span>
              <span className="text-[10px]">▾</span>
            </button>

            <div className="flex items-center gap-0.5 px-1">
              <ToolbarButton
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Bold (⌘B)"
              >
                <strong>B</strong>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Italic (⌘I)"
              >
                <em>I</em>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title="Underline (⌘U)"
              >
                <span className="underline">U</span>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                title="Strikethrough (⌘⇧S)"
              >
                <span className="line-through">S</span>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
                title="Inline Code (⌘E)"
                className="font-mono text-xs"
              >
                {"<>"}
              </ToolbarButton>
            </div>

            <div className="mx-0.5 h-5 w-px bg-border" />

            <div className="flex items-center gap-0.5 px-1">
              <ToolbarButton
                active={!!activeHighlight}
                onClick={() => setMode("color")}
                title="Highlight color"
              >
                <span
                  className="inline-block h-4 w-4 rounded-sm border border-border"
                  style={{ backgroundColor: activeHighlight ?? "#fef08a" }}
                />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("link")}
                onClick={() => setMode("link")}
                title="Link (⌘K)"
              >
                🔗
              </ToolbarButton>
            </div>
          </>
        )}

        {mode === "link" && (
          <LinkEditor editor={editor} onClose={closePopover} />
        )}

        {mode === "block" && (
          <BlockDropdown editor={editor} onClose={closePopover} />
        )}

        {mode === "color" && (
          <ColorPopover editor={editor} onClose={closePopover} />
        )}

        {mode !== "toolbar" && (
          <button
            type="button"
            title="Back"
            onClick={closePopover}
            className="flex h-7 w-7 items-center justify-center rounded-r-lg border-l border-border text-muted-foreground hover:bg-accent"
          >
            ✕
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}

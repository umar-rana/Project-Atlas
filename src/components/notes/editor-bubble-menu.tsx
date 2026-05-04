"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { BubbleMenuPlugin, type BubbleMenuPluginProps } from "@tiptap/extension-bubble-menu";
import { PluginKey } from "@tiptap/pm/state";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  ChevronDown,
  X,
  Highlighter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BubbleMenuProps = {
  editor: Editor;
  shouldShow?: BubbleMenuPluginProps["shouldShow"];
  options?: BubbleMenuPluginProps["options"];
  children: React.ReactNode;
};

const BUBBLE_MENU_PLUGIN_KEY = new PluginKey("editorBubbleMenu");

function BubbleMenu({ editor, shouldShow = null, options, children }: BubbleMenuProps) {
  const menuEl = useRef<HTMLDivElement | null>(null);
  const shouldShowRef = useRef(shouldShow);
  const optionsRef = useRef(options);
  shouldShowRef.current = shouldShow;
  optionsRef.current = options;
  const [mounted, setMounted] = useState(false);

  if (!menuEl.current && typeof document !== "undefined") {
    const el = document.createElement("div");
    el.style.visibility = "hidden";
    el.style.position = "absolute";
    el.style.zIndex = "80";
    menuEl.current = el;
  }

  useEffect(() => {
    const el = menuEl.current;
    if (!el || editor.isDestroyed) return;

    const plugin = BubbleMenuPlugin({
      pluginKey: BUBBLE_MENU_PLUGIN_KEY,
      editor,
      element: el,
      shouldShow: shouldShowRef.current ?? null,
      updateDelay: 0,
      options: optionsRef.current,
    });

    editor.registerPlugin(plugin);
    setMounted(true);

    return () => {
      setMounted(false);
      editor.unregisterPlugin(BUBBLE_MENU_PLUGIN_KEY);
      window.requestAnimationFrame(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, [editor]);

  if (!mounted || !menuEl.current) return null;
  return createPortal(children, menuEl.current);
}

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
        "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-sm font-medium transition-colors duration-fast ease-standard",
        "hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
        active
          ? "bg-surface-hover text-text-primary"
          : "text-text-tertiary",
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
        className="h-7 w-52 rounded border border-border-default bg-surface-base px-2 text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-border-focus"
      />
      <button
        type="button"
        onClick={apply}
        className="h-7 rounded bg-accent-primary px-2 text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
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
          className="h-7 rounded px-2 text-xs text-accent-danger hover:bg-accent-danger-muted focus-visible:focus-ring"
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
            "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            active === bt.id && "bg-surface-hover font-medium text-text-primary",
          )}
        >
          <span className="w-6 text-center text-xs font-mono text-text-tertiary">
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
        <p className="text-xs font-medium text-text-tertiary">Text colour</p>
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
                "h-6 w-6 rounded border-2 transition-all hover:scale-110 focus-visible:focus-ring",
                c.value === null
                  ? "border-border-default bg-transparent text-[10px] text-text-tertiary"
                  : activeTextColor === c.value
                  ? "border-accent-primary"
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
        <p className="text-xs font-medium text-text-tertiary">Highlight</p>
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
                "h-6 w-6 rounded border-2 transition-all hover:scale-110 focus-visible:focus-ring",
                c.value === null
                  ? "border-border-default bg-transparent text-[10px] text-text-tertiary"
                  : activeHighlight === c.value
                  ? "border-accent-primary"
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
      options={{
        placement: "top",
        flip: {},
        offset: 8,
        shift: {},
      }}
      shouldShow={shouldShow}
    >
      <div
        className="flex items-center rounded-lg border border-border-default bg-surface-raised shadow-2 animate-in fade-in-0 zoom-in-95 duration-100"
        onMouseDown={(e) => e.preventDefault()}
      >
        {mode === "toolbar" && (
          <>
            <button
              type="button"
              title="Block type"
              onClick={() => setMode("block")}
              className={cn(
                "flex h-7 items-center gap-1 rounded-l-lg px-2 text-xs font-medium transition-colors duration-fast ease-standard",
                "text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
                "border-r border-border-default",
              )}
            >
              <span className="font-mono text-[11px]">{activeBlockDef?.icon ?? "¶"}</span>
              <span className="max-w-[60px] truncate">{activeBlockDef?.label ?? "Text"}</span>
              <ChevronDown size={11} className="shrink-0 opacity-60" />
            </button>

            <div className="flex items-center gap-0.5 px-1">
              <ToolbarButton
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Bold (⌘B)"
              >
                <Bold size={13} strokeWidth={2.5} />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Italic (⌘I)"
              >
                <Italic size={13} strokeWidth={2.5} />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title="Underline (⌘U)"
              >
                <Underline size={13} strokeWidth={2.5} />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                title="Strikethrough (⌘⇧S)"
              >
                <Strikethrough size={13} strokeWidth={2.5} />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
                title="Inline Code (⌘E)"
              >
                <Code size={13} strokeWidth={2.5} />
              </ToolbarButton>
            </div>

            <div className="mx-0.5 h-4 w-px bg-border-default" />

            <div className="flex items-center gap-0.5 px-1">
              <ToolbarButton
                active={!!activeHighlight}
                onClick={() => setMode("color")}
                title="Colour & highlight"
              >
                <Highlighter size={13} strokeWidth={2.5} />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("link")}
                onClick={() => setMode("link")}
                title="Link (⌘K)"
              >
                <Link size={13} strokeWidth={2.5} />
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
            className="flex h-7 w-7 items-center justify-center rounded-r-lg border-l border-border-default text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}

"use client";

import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node } from "@tiptap/pm/model";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { EditorBlockMenu } from "./editor-block-menu";
import { Hint } from "@/components/ui/hint";

type BlockMenuState = {
  pos: number;
  anchor: { x: number; y: number };
} | null;

type Props = {
  editor: Editor;
};

export function EditorBlockHandle({ editor }: Props) {
  const [currentPos, setCurrentPos] = useState<number>(0);
  const [blockMenu, setBlockMenu] = useState<BlockMenuState>(null);

  function handleNodeChange({ pos }: { node: Node | null; editor: Editor; pos: number }) {
    setCurrentPos(pos);
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBlockMenu({
      pos: currentPos,
      anchor: { x: rect.right + 4, y: rect.top },
    });
  }

  return (
    <>
      <DragHandle
        editor={editor}
        onNodeChange={handleNodeChange}
        className="drag-handle-wrapper"
        nested
      >
        <Hint label="Drag to reorder or click to open menu">
          <button
            type="button"
            onClick={handleClick}
            aria-label="Drag to reorder or click to open menu"
            className="flex h-5 w-5 cursor-grab items-center justify-center rounded text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring active:cursor-grabbing"
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
              <circle cx="2.5" cy="2.5" r="1.5" />
              <circle cx="7.5" cy="2.5" r="1.5" />
              <circle cx="2.5" cy="7" r="1.5" />
              <circle cx="7.5" cy="7" r="1.5" />
              <circle cx="2.5" cy="11.5" r="1.5" />
              <circle cx="7.5" cy="11.5" r="1.5" />
            </svg>
          </button>
        </Hint>
      </DragHandle>

      {blockMenu && (
        <EditorBlockMenu
          editor={editor}
          pos={blockMenu.pos}
          anchor={blockMenu.anchor}
          onClose={() => setBlockMenu(null)}
        />
      )}
    </>
  );
}

"use client";

import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node } from "@tiptap/pm/model";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { EditorBlockMenu } from "./editor-block-menu";

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
        <button
          type="button"
          title="Drag to reorder · Click to open menu"
          onClick={handleClick}
          className="flex h-5 w-5 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2.5" cy="2.5" r="1.5" />
            <circle cx="7.5" cy="2.5" r="1.5" />
            <circle cx="2.5" cy="7" r="1.5" />
            <circle cx="7.5" cy="7" r="1.5" />
            <circle cx="2.5" cy="11.5" r="1.5" />
            <circle cx="7.5" cy="11.5" r="1.5" />
          </svg>
        </button>
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

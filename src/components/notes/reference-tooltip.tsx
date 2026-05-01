"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

type TooltipState = {
  targetType: string;
  targetId: string;
  displayText: string;
  rect: DOMRect;
};

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  task: "Task",
  project: "Project",
  tag: "Tag",
  context: "Context",
};

function EntityPreview({
  targetType,
  targetId,
  displayText,
}: {
  targetType: string;
  targetId: string;
  displayText: string;
}) {
  const noteQuery = trpc.notes.get.useQuery(
    { id: targetId },
    { enabled: targetType === "note" && !!targetId, retry: false },
  );

  const taskQuery = trpc.tasks.get.useQuery(
    { id: targetId },
    { enabled: targetType === "task" && !!targetId, retry: false },
  );

  const projectQuery = trpc.projects.get.useQuery(
    { id: targetId },
    { enabled: targetType === "project" && !!targetId, retry: false },
  );

  let title = displayText;
  let firstLine: string | null = null;

  if (targetType === "note" && noteQuery.data) {
    title = noteQuery.data.title || displayText;
    const rawFirstLine = noteQuery.data.body_text?.split("\n").find((l) => l.trim().length > 0);
    firstLine = rawFirstLine?.slice(0, 120) ?? null;
  } else if (targetType === "task" && taskQuery.data) {
    title = taskQuery.data.title ?? displayText;
    firstLine = taskQuery.data.notes?.split("\n")[0]?.slice(0, 120) ?? null;
  } else if (targetType === "project" && projectQuery.data) {
    title = projectQuery.data.title ?? displayText;
  }

  const typeLabel = TYPE_LABELS[targetType] ?? targetType;

  return (
    <div className="min-w-[180px] max-w-[280px]">
      <div className="text-xs text-muted-foreground mb-0.5">{typeLabel}</div>
      <div className="text-sm font-medium leading-tight">{title}</div>
      {firstLine && (
        <div className="text-xs text-muted-foreground mt-1 leading-tight line-clamp-2">
          {firstLine}
        </div>
      )}
    </div>
  );
}

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function ReferenceTooltipLayer({ containerRef }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((state: TooltipState) => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
    setTooltip(state);
  }, []);

  const hideTooltip = useCallback(() => {
    hideTimeout.current = setTimeout(() => {
      setTooltip(null);
    }, 120);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const refNode = target.closest("[data-reference]") as HTMLElement | null;
      if (!refNode) {
        hideTooltip();
        return;
      }

      const targetType = refNode.dataset["targetType"] ?? "note";
      const targetId = refNode.dataset["targetId"] ?? "";
      const displayText = refNode.dataset["displayText"] ?? refNode.textContent ?? "";
      const rect = refNode.getBoundingClientRect();

      showTooltip({ targetType, targetId, displayText, rect });
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (relatedTarget?.closest("[data-reference-tooltip]")) return;
      hideTooltip();
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);
    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
    };
  }, [containerRef, showTooltip, hideTooltip]);

  if (!tooltip) return null;

  const { rect, targetType, targetId, displayText } = tooltip;
  const top = rect.bottom + 6;
  const left = rect.left;

  return (
    <div
      data-reference-tooltip
      style={{ top, left, position: "fixed", zIndex: 60 }}
      className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm"
      onMouseEnter={() => {
        if (hideTimeout.current) {
          clearTimeout(hideTimeout.current);
          hideTimeout.current = null;
        }
      }}
      onMouseLeave={hideTooltip}
    >
      <EntityPreview
        targetType={targetType}
        targetId={targetId}
        displayText={displayText}
      />
    </div>
  );
}

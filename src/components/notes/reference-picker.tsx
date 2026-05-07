"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import type { ReferencePickerType } from "@/core/editor/reference-extension";

export type ReferenceItem = {
  id: string;
  display_text: string;
  target_type: "note" | "tag" | "context" | "task" | "project" | "table" | "person";
  subtitle?: string;
  group?: string;
};

type Props = {
  trigger: ReferencePickerType;
  query: string;
  position: { top: number; left: number };
  onSelect: (item: ReferenceItem) => void;
  onCreateNote?: (title: string) => void;
  onCreatePerson?: (name: string) => void;
  onClose: () => void;
};

const TYPE_ICONS: Record<string, string> = {
  note: "📄",
  task: "✓",
  project: "📁",
  tag: "#",
  context: "@",
  table: "⊞",
  person: "👤",
};

function useNoteResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.notes.search.useQuery(
    { query, limit: 8 },
    { enabled },
  );
  return (data ?? []).map((n): ReferenceItem => ({
    id: n.id,
    display_text: n.title || "Untitled",
    target_type: "note",
    subtitle: n.body_text?.slice(0, 60) ?? undefined,
    group: "Notes",
  }));
}

function useTaskResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.search.tasks.useQuery(
    { query: query || " ", limit: 5 },
    { enabled: enabled && query.length > 0 },
  );
  return (data ?? []).map((t): ReferenceItem => ({
    id: t.id,
    display_text: t.title,
    target_type: "task",
    subtitle: t.project_title ?? undefined,
    group: "Tasks",
  }));
}

function useProjectResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.projects.list.useQuery({}, { enabled });
  const q = query.toLowerCase();
  const filtered = (data ?? []).filter(
    (p) => !q || p.title.toLowerCase().includes(q),
  ).slice(0, 5);
  return filtered.map((p): ReferenceItem => ({
    id: p.id,
    display_text: p.title,
    target_type: "project",
    group: "Projects",
  }));
}

function useTagResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.tags.search.useQuery(
    { query, limit: 10 },
    { enabled },
  );
  const q = query.toLowerCase();
  const filtered = q
    ? (data ?? []).filter((t) => t.name.toLowerCase().includes(q))
    : (data ?? []).slice(0, 10);
  return filtered.map((t): ReferenceItem => ({
    id: t.id,
    display_text: t.name,
    target_type: "tag",
  }));
}

function useContextResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.contexts.list.useQuery(undefined, { enabled });
  const q = query.toLowerCase();
  const filtered = q
    ? (data ?? []).filter((c) => c.name.toLowerCase().includes(q))
    : (data ?? []).slice(0, 10);
  return filtered.map((c): ReferenceItem => ({
    id: c.id,
    display_text: c.name,
    target_type: "context",
  }));
}

function usePersonResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.people.search.useQuery(
    { query, limit: 8 },
    { enabled },
  );
  return (data ?? []).map((p): ReferenceItem => {
    const displayName = [p.display_name, p.given_name, p.family_name].filter(Boolean)[0] ?? p.handle;
    const org = p.organizations[0];
    const subtitle = org ? [org.title, org.name].filter(Boolean).join(" @ ") : (p.emails[0]?.email ?? undefined);
    return {
      id: p.id,
      display_text: displayName,
      target_type: "person",
      subtitle,
      group: "People",
    };
  });
}

function useTableResults(query: string, enabled: boolean): ReferenceItem[] {
  const { data } = trpc.tables.search.useQuery(
    { query, limit: 8 },
    { enabled },
  );
  return (data ?? []).map((t): ReferenceItem => ({
    id: t.id,
    display_text: t.name,
    target_type: "table",
    subtitle: t.description?.slice(0, 60) ?? undefined,
    group: "Tables",
  }));
}

function useReferenceResults(trigger: ReferencePickerType, query: string): ReferenceItem[] {
  const notes = useNoteResults(query, trigger === "note");
  const tasks = useTaskResults(query, trigger === "note");
  const projects = useProjectResults(query, trigger === "note");
  const tables = useTableResults(query, trigger === "note");
  const tags = useTagResults(query, trigger === "tag");
  const contexts = useContextResults(query, trigger === "context");
  const people = usePersonResults(query, trigger === "person");

  if (trigger === "note") {
    return [...notes, ...tasks, ...projects, ...tables];
  }
  if (trigger === "tag") return tags;
  if (trigger === "context") return contexts;
  if (trigger === "person") return people;
  return [];
}

const TRIGGER_LABELS: Record<ReferencePickerType, string> = {
  note: "Link to…",
  tag: "Tags",
  context: "Contexts",
  person: "People",
};

type GroupedItems = { group: string; items: ReferenceItem[]; startIndex: number }[];

function groupItems(items: ReferenceItem[]): GroupedItems {
  const groupMap = new Map<string, ReferenceItem[]>();
  for (const item of items) {
    const g = item.group ?? item.target_type;
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(item);
  }

  const result: GroupedItems = [];
  let idx = 0;
  for (const [group, groupItems] of groupMap) {
    result.push({ group, items: groupItems, startIndex: idx });
    idx += groupItems.length;
  }
  return result;
}

export function ReferencePicker({
  trigger,
  query,
  position,
  onSelect,
  onCreateNote,
  onCreatePerson,
  onClose,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useReferenceResults(trigger, query);

  const hasCreateAction =
    (trigger === "note") || (trigger === "person" && !!query.trim());
  const totalItems = results.length + (hasCreateAction ? 1 : 0);
  const grouped = groupItems(results);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, trigger]);

  const handleSelect = useCallback(
    (index: number) => {
      const item = results[index];
      if (index < results.length && item) {
        onSelect(item);
      } else if (trigger === "note" && onCreateNote) {
        onCreateNote(query);
      } else if (trigger === "person" && onCreatePerson) {
        onCreatePerson(query);
      }
    },
    [results, trigger, onCreateNote, onCreatePerson, onSelect, query],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, totalItems - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(activeIndex);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, handleSelect, totalItems, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (totalItems === 0 && trigger !== "note" && trigger !== "person") {
    return (
      <div
        style={{ top: position.top, left: position.left }}
        className="fixed z-overlay rounded-lg border border-border-default bg-surface-raised p-3 text-sm text-text-tertiary shadow-2 min-w-[200px]"
      >
        No {TRIGGER_LABELS[trigger].toLowerCase()} found
      </div>
    );
  }

  return (
    <div
      style={{ top: position.top, left: position.left }}
      className="fixed z-overlay overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-2 min-w-[260px] max-w-[380px]"
    >
      <div className="border-b border-border-default bg-surface-sunken px-3 py-1.5 text-xs font-medium text-text-tertiary">
        {TRIGGER_LABELS[trigger]}
        {query && <span className="ml-1 opacity-60">&ldquo;{query}&rdquo;</span>}
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
        {grouped.map(({ group, items, startIndex }) => (
          <div key={group}>
            {(trigger === "note" || trigger === "person") && (
              <div className="px-3 pt-2 pb-0.5 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                {group}
              </div>
            )}
            {items.map((item, i) => {
              const globalIdx = startIndex + i;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-idx={globalIdx}
                  className={cn(
                    "w-full text-left px-3 py-2 flex items-start gap-2 transition-colors duration-fast hover:bg-surface-hover",
                    globalIdx === activeIndex && "bg-surface-hover",
                  )}
                  onMouseEnter={() => setActiveIndex(globalIdx)}
                  onClick={() => handleSelect(globalIdx)}
                >
                  <span className="text-xs w-4 flex-shrink-0 mt-0.5 text-text-tertiary">
                    {TYPE_ICONS[item.target_type] ?? "·"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.display_text}</div>
                    {item.subtitle && (
                      <div className="text-xs text-text-tertiary truncate">{item.subtitle}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        {trigger === "note" && (
          <button
            type="button"
            data-idx={results.length}
            className={cn(
              "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors duration-fast hover:bg-surface-hover text-sm text-text-primary border-t border-border-default mt-1",
              activeIndex === results.length && "bg-surface-hover",
            )}
            onMouseEnter={() => setActiveIndex(results.length)}
            onClick={() => handleSelect(results.length)}
          >
            <span className="text-xs w-4 flex-shrink-0">＋</span>
            <span>Create note{query ? `: "${query}"` : ""}</span>
          </button>
        )}
        {trigger === "person" && query.trim() && (
          <button
            type="button"
            data-idx={results.length}
            className={cn(
              "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors duration-fast hover:bg-surface-hover text-sm text-text-primary border-t border-border-default mt-1",
              activeIndex === results.length && "bg-surface-hover",
            )}
            onMouseEnter={() => setActiveIndex(results.length)}
            onClick={() => handleSelect(results.length)}
          >
            <span className="text-xs w-4 flex-shrink-0">＋</span>
            <span>Create person: &ldquo;{query}&rdquo;</span>
          </button>
        )}
      </div>
    </div>
  );
}

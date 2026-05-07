"use client";

import React, { useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { PersonCard } from "@/components/people/person-card";
import { EmptyState } from "@/components/composed/empty-state";
import { Users, LayoutGrid, List, Plus, Search, Tag, X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import Link from "next/link";

type ViewMode = "card" | "list";
type SortMode = "name" | "created_at" | "updated_at" | "last_contacted_at";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);
  return debounced;
}

export function PeopleClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchRaw, setSearchRaw] = useState(searchParams.get("q") ?? "");
  const search = useDebounce(searchRaw, 200);
  const [relationshipType, setRelationshipType] = useState(searchParams.get("type") ?? "");
  const [sort, setSort] = useState<SortMode>((searchParams.get("sort") as SortMode) ?? "name");
  const [view, setView] = useState<ViewMode>((searchParams.get("view") as ViewMode) ?? "card");
  const [tagFilters, setTagFilters] = useState<string[]>(() => {
    const raw = searchParams.get("tags");
    return raw ? raw.split(",").filter(Boolean) : [];
  });
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const { data, isLoading } = trpc.people.list.useQuery({
    search: search || undefined,
    relationship_type: relationshipType || undefined,
    tag_ids: tagFilters.length > 0 ? tagFilters : undefined,
    sort,
    limit: 100,
  });

  const { data: types = [] } = trpc.people.getRelationshipTypes.useQuery();
  const { data: allTags = [] } = trpc.tags.list.useQuery();

  const people = data?.people ?? [];
  const hasFilters = !!(search || relationshipType || tagFilters.length > 0);

  function toggleTagFilter(tagId: string) {
    const next = tagFilters.includes(tagId)
      ? tagFilters.filter((id) => id !== tagId)
      : [...tagFilters, tagId];
    setTagFilters(next);
    updateUrl({ tags: next.length > 0 ? next.join(",") : undefined });
  }

  const activeTagNames = allTags.filter((t) => tagFilters.includes(t.id)).map((t) => t.name);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
        <h1 className="font-semibold text-text-primary text-md flex-1">People</h1>
        <Hint label="Follow-up queue">
          <Link href="/people/follow-up" className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors">
            <Bell size={16} />
          </Link>
        </Hint>
        <Hint label="Add person">
          <Link href="/people/new" className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors">
            <Plus size={16} />
          </Link>
        </Hint>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border-subtle shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => {
              setSearchRaw(e.target.value);
              updateUrl({ q: e.target.value || undefined });
            }}
            placeholder="Search people…"
            className="w-full rounded-md border border-border-default bg-surface-sunken pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
        </div>

        {/* Tag filter button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setTagPickerOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors",
              tagFilters.length > 0
                ? "border-accent-primary text-accent-primary bg-accent-primary-subtle"
                : "border-border-default text-text-secondary hover:border-border-strong",
            )}
          >
            <Tag size={12} />
            {tagFilters.length > 0 ? `Tags (${tagFilters.length})` : "Filter by tag"}
          </button>

          {tagPickerOpen && allTags.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-dropdown w-48 rounded-lg border border-border-default bg-surface-raised shadow-2 py-1 max-h-52 overflow-y-auto">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTagFilter(tag.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-surface-hover",
                    tagFilters.includes(tag.id) && "text-accent-primary",
                  )}
                >
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: tag.color ?? "currentColor" }} />
                  #{tag.name}
                  {tagFilters.includes(tag.id) && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active tag filter chips */}
        {activeTagNames.map((name, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs border border-accent-primary rounded-full px-2 py-0.5 text-accent-primary bg-accent-primary-subtle">
            #{name}
            <button type="button" onClick={() => toggleTagFilter(tagFilters[i]!)} className="text-accent-primary hover:text-accent-danger">
              <X size={10} />
            </button>
          </span>
        ))}

        {/* Relationship type chips */}
        {types.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => { setRelationshipType(""); updateUrl({ type: undefined }); }}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                !relationshipType
                  ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                  : "border-border-default text-text-secondary hover:border-border-strong",
              )}
            >
              All
            </button>
            {types.map((t) => (
              <button
                key={t}
                onClick={() => { const next = t === relationshipType ? "" : (t ?? ""); setRelationshipType(next); updateUrl({ type: next || undefined }); }}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border capitalize transition-colors",
                  relationshipType === t
                    ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                    : "border-border-default text-text-secondary hover:border-border-strong",
                )}
              >
                {t?.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value as SortMode); updateUrl({ sort: e.target.value }); }}
            className="text-sm border border-border-default rounded-md bg-surface-raised px-2 py-1.5 text-text-secondary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            <option value="name">Name</option>
            <option value="created_at">Recently added</option>
            <option value="updated_at">Recently updated</option>
            <option value="last_contacted_at">Last contacted</option>
          </select>

          {/* View toggle */}
          <div className="flex border border-border-default rounded-md overflow-hidden ml-1">
            <Hint label="Card view">
              <button
                type="button"
                onClick={() => { setView("card"); updateUrl({ view: "card" }); }}
                className={cn(
                  "p-1.5 transition-colors",
                  view === "card" ? "bg-surface-selected text-accent-primary" : "text-text-tertiary hover:bg-surface-hover",
                )}
              >
                <LayoutGrid size={14} />
              </button>
            </Hint>
            <Hint label="List view">
              <button
                type="button"
                onClick={() => { setView("list"); updateUrl({ view: "list" }); }}
                className={cn(
                  "p-1.5 transition-colors",
                  view === "list" ? "bg-surface-selected text-accent-primary" : "text-text-tertiary hover:bg-surface-hover",
                )}
              >
                <List size={14} />
              </button>
            </Hint>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" onClick={() => setTagPickerOpen(false)}>
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-text-tertiary text-sm">Loading…</div>
        ) : people.length === 0 ? (
          <div className="flex items-center justify-center h-full py-12">
            {hasFilters ? (
              <EmptyState
                icon={<Users size={28} />}
                title="No people found"
                body="Try adjusting your search or filters."
              />
            ) : (
              <EmptyState
                icon={<Users size={28} />}
                title="No people yet"
                body="Add your first contact to start building your relationship graph."
                action={
                  <Link href="/people/new" className="inline-flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover transition-colors">
                    <Plus size={14} /> Add person
                  </Link>
                }
              />
            )}
          </div>
        ) : view === "card" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} view="card" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} view="list" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

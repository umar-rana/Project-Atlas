"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { Search, X, Tag, Inbox, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

interface CaptureRow {
  id: string;
  raw_text: string;
  title: string | null;
  tags: string[];
  due_date: Date | string | null;
  ai_parsed: boolean;
  created_at: Date | string;
}

interface CaptureCardProps extends CaptureRow {
  activeTag: string;
  onTagClick: (tag: string) => void;
}

function CaptureCard({
  raw_text,
  title,
  tags,
  due_date,
  ai_parsed,
  created_at,
  activeTag,
  onTagClick,
}: CaptureCardProps) {
  const locale = useLocale();
  const displayTitle = title ?? raw_text;
  const isRawFallback = !title;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base p-4 transition-colors hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-ui text-sm font-medium leading-snug",
              isRawFallback ? "italic text-text-secondary" : "text-text-primary",
            )}
          >
            {displayTitle}
          </p>
          {!isRawFallback && raw_text !== displayTitle && (
            <p className="mt-1 line-clamp-2 font-ui text-xs text-text-tertiary">{raw_text}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {ai_parsed && (
            <span className="rounded-full bg-accent-primary-subtle px-1.5 py-0.5 font-ui text-[10px] font-medium text-accent-primary">
              AI
            </span>
          )}
          <span className="font-ui text-xs text-text-tertiary">{localeFormatDate(created_at, locale)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {due_date && (
          <span className="font-ui text-xs text-text-secondary">
            Due {localeFormatDate(due_date, locale)}
          </span>
        )}
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick(tag)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-[11px] transition-colors",
              activeTag === tag
                ? "bg-accent-primary text-white"
                : "bg-surface-sunken text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <Tag size={10} aria-hidden />
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export function CapturesList() {
  const [search, setSearch] = React.useState("");
  const [activeTag, setActiveTag] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [allCaptures, setAllCaptures] = React.useState<CaptureRow[]>([]);
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const queryKey = `${debouncedSearch}|${activeTag}`;
  const queryKeyRef = React.useRef(queryKey);

  const query = trpc.capture.list.useQuery(
    {
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      tag: activeTag || undefined,
      cursor,
    },
    { staleTime: 15_000 },
  );

  React.useEffect(() => {
    if (!query.data) return;

    if (queryKey !== queryKeyRef.current) {
      queryKeyRef.current = queryKey;
      setCursor(undefined);
      setAllCaptures(query.data.captures as CaptureRow[]);
      setNextCursor(query.data.nextCursor);
      setIsLoadingMore(false);
    } else if (cursor === undefined) {
      setAllCaptures(query.data.captures as CaptureRow[]);
      setNextCursor(query.data.nextCursor);
      setIsLoadingMore(false);
    } else if (isLoadingMore) {
      setAllCaptures((prev) => [...prev, ...(query.data!.captures as CaptureRow[])]);
      setNextCursor(query.data.nextCursor);
      setIsLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  React.useEffect(() => {
    if (queryKey !== queryKeyRef.current) {
      setCursor(undefined);
      setIsLoadingMore(false);
    }
  }, [queryKey]);

  function handleLoadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    setCursor(nextCursor);
  }

  function handleTagClick(tag: string) {
    setActiveTag((prev) => (prev === tag ? "" : tag));
  }

  function clearFilters() {
    setSearch("");
    setActiveTag("");
  }

  const hasFilters = !!debouncedSearch || !!activeTag;
  const isInitialLoading = query.isLoading && allCaptures.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-ui text-base font-semibold text-text-primary">Captures</h1>
          <span className="font-ui text-xs text-text-tertiary">
            {isInitialLoading
              ? "Loading…"
              : `${allCaptures.length} capture${allCaptures.length !== 1 ? "s" : ""}${nextCursor ? "+" : ""}`}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search captures…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border-default bg-surface-base py-1.5 pl-8 pr-3 font-ui text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-primary focus:outline-none"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover"
            >
              <X size={12} aria-hidden />
              Clear
            </button>
          )}
        </div>

        {activeTag && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="font-ui text-xs text-text-tertiary">Filtered by tag:</span>
            <button
              type="button"
              onClick={() => setActiveTag("")}
              className="flex items-center gap-1 rounded-full bg-accent-primary px-2 py-0.5 font-ui text-[11px] text-white"
            >
              <Tag size={10} aria-hidden />
              {activeTag}
              <X size={10} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isInitialLoading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="font-ui text-sm text-text-tertiary">Loading captures…</span>
          </div>
        ) : allCaptures.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <Inbox size={28} className="text-text-tertiary" aria-hidden />
            <p className="font-ui text-sm font-medium text-text-secondary">
              {hasFilters ? "No captures match your search" : "No captures yet"}
            </p>
            {!hasFilters && (
              <p className="font-ui text-xs text-text-tertiary">
                Use the capture bar to save your first capture.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {allCaptures.map((capture) => (
                <CaptureCard
                  key={capture.id}
                  id={capture.id}
                  raw_text={capture.raw_text}
                  title={capture.title}
                  tags={capture.tags}
                  due_date={capture.due_date}
                  ai_parsed={capture.ai_parsed}
                  created_at={capture.created_at}
                  activeTag={activeTag}
                  onTagClick={handleTagClick}
                />
              ))}
            </div>

            {nextCursor && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={query.isFetching}
                  className="flex items-center gap-2 rounded-md border border-border-default px-4 py-2 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  <ChevronDown size={14} aria-hidden />
                  {query.isFetching ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

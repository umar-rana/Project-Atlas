"use client";

import * as React from "react";
import Link from "next/link";
import { Search, FileText } from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";

interface NoteItem {
  id: string;
  title: string;
  purpose: string;
  body_text: string;
  updated_at: Date | string;
  word_count: number | null;
}

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "meeting_note": return "Meeting";
    case "project_brief": return "Brief";
    case "reading_note": return "Reading";
    default: return "Note";
  }
}

function NoteCard({ note }: { note: NoteItem }) {
  const updatedAt = format(new Date(note.updated_at), "MMM d");
  const preview = note.body_text?.slice(0, 120);

  return (
    <li>
      <Link
        href={`/m/notes/${note.id}`}
        className="flex min-h-[72px] flex-col gap-1 border-b border-border-subtle px-4 py-3 transition-colors active:bg-surface-hover"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1 font-ui text-base font-medium leading-snug text-text-primary">
            {note.title || "Untitled"}
          </p>
          <span className="shrink-0 font-ui text-xs tabular-nums text-text-tertiary">{updatedAt}</span>
        </div>
        {preview ? (
          <p className="line-clamp-2 font-ui text-sm leading-snug text-text-tertiary">{preview}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-ui text-[10px] text-text-tertiary">
            {purposeLabel(note.purpose)}
          </span>
          {note.word_count ? (
            <span className="font-ui text-[10px] text-text-disabled">
              {note.word_count} words
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

export default function MobileNotesPage() {
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const searchQuery = trpc.search.notes.useQuery(
    { query: debouncedSearch, limit: 50 },
    { enabled: debouncedSearch.length > 0, staleTime: 10_000 },
  );

  const listQuery = trpc.notes.list.useQuery(
    { limit: 100 },
    { enabled: debouncedSearch.length === 0, staleTime: 30_000 },
  );

  const isSearching = debouncedSearch.length > 0;
  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;

  const notes: NoteItem[] = isSearching
    ? (searchQuery.data ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        purpose: n.purpose,
        body_text: n.body_text,
        updated_at: n.updated_at,
        word_count: null,
      }))
    : (listQuery.data?.notes ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        purpose: n.purpose,
        body_text: n.body_text ?? "",
        updated_at: n.updated_at,
        word_count: n.word_count,
      }));

  async function handleRefresh() {
    if (isSearching) await searchQuery.refetch();
    else await listQuery.refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Notes</h1>
        <div className="relative mt-3">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className={cn(
              "h-9 w-full rounded-lg border border-border-subtle bg-surface-raised pl-9 pr-3",
              "font-ui text-sm text-text-primary placeholder:text-text-disabled",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary/30",
            )}
          />
        </div>
      </header>

      <PullToRefresh onRefresh={handleRefresh} className="flex-1">
        {isLoading ? (
          <ul role="list">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="border-b border-border-subtle px-4 py-3 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-raised" />
                <div className="h-3 w-full animate-pulse rounded bg-surface-raised" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-surface-raised" />
              </li>
            ))}
          </ul>
        ) : notes.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText size={36} className="text-text-tertiary" aria-hidden />
            <p className="font-ui text-sm text-text-tertiary">
              {isSearching ? `No notes matching "${debouncedSearch}"` : "No notes yet"}
            </p>
          </div>
        ) : (
          <ul role="list">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </ul>
        )}
      </PullToRefresh>
    </div>
  );
}

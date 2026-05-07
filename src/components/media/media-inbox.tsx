"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { AttachmentTile, AttachmentTileEmpty } from "@/components/attachments/attachment-tile";
import { AttachmentDetailPanel } from "@/components/attachments/attachment-detail-panel";
import { MediaFilters, type MediaFiltersState } from "./media-filters";
import { MediaSort, type SortOption } from "./media-sort";
import { MediaBulkBar } from "./media-bulk-bar";
import { ChevronLeft, ChevronRight } from "lucide-react";

type FileType = "image" | "pdf" | "video" | "audio" | "doc" | "other";

export function MediaInbox() {
  const [filters, setFilters] = React.useState<MediaFiltersState>({ search: "" });
  const [sort, setSort] = React.useState<SortOption>("newest");
  const [page, setPage] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const lastSelectedId = React.useRef<string | null>(null);

  const tags = trpc.tags.list.useQuery({ limit: 200 });

  const query = trpc.media.list.useQuery(
    {
      page,
      per_page: 48,
      file_type: filters.file_type as FileType | undefined,
      source: filters.source,
      reviewed: filters.reviewed,
      tag_id: filters.tag_id,
      search: filters.search || undefined,
      date_from: filters.date_from,
      date_to: filters.date_to,
      sort,
    },
    { staleTime: 15_000 },
  );

  const items = query.data?.items ?? [];
  const totalPages = query.data?.total_pages ?? 1;
  const total = query.data?.total ?? 0;

  function handleSelect(id: string, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedId.current) {
      const ids = items.map((it) => it.id);
      const a = ids.indexOf(lastSelectedId.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelectedIds((prev) => {
          const set = new Set([...prev, ...range]);
          return Array.from(set);
        });
        return;
      }
    }
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    lastSelectedId.current = id;
  }

  function handleClick(id: string) {
    lastSelectedId.current = id;
    setActiveId(id);
  }

  React.useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-ui text-base font-semibold text-text-primary">Media</h1>
            <div className="flex items-center gap-2">
              <span className="font-ui text-xs text-text-tertiary">
                {total} file{total !== 1 ? "s" : ""}
              </span>
              <MediaSort value={sort} onChange={setSort} />
            </div>
          </div>
          <MediaFilters
            filters={filters}
            onChange={setFilters}
            tags={(tags.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex justify-center border-b border-border-subtle px-4 py-2">
            <MediaBulkBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {query.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <span className="font-ui text-sm text-text-tertiary">Loading…</span>
            </div>
          ) : items.length === 0 ? (
            <AttachmentTileEmpty />
          ) : (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
              {items.map((item) => (
                <AttachmentTile
                  key={item.id}
                  id={item.id}
                  file_id={item.file_id}
                  filename={item.filename}
                  content_type={item.content_type}
                  size_bytes={item.size_bytes}
                  thumbnail_path={item.thumbnail_path}
                  source_label={item.source_label}
                  is_orphan={item.is_orphan}
                  reviewed={item.reviewed}
                  created_at={item.created_at}
                  selected={selectedIds.includes(item.id)}
                  onSelect={handleSelect}
                  onClick={handleClick}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-sm border border-border-default p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-ui text-xs text-text-tertiary">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-sm border border-border-default p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {activeId && (
        <AttachmentDetailPanel
          attachmentId={activeId}
          onClose={() => setActiveId(null)}
          onDeleted={() => {
            setActiveId(null);
            query.refetch();
          }}
        />
      )}
    </div>
  );
}

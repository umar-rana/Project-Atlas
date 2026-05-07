"use client";

import React, { useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { PersonAvatar } from "@/components/people/person-avatar";
import { LogInteractionModal } from "@/components/people/log-interaction-modal";
import { deriveDisplayName } from "@/core/people/validation";
import { useLocale } from "@/core/locale/hooks";
import { formatRelativeDate } from "@/core/locale/formatters";
import { Bell, BellOff, Activity, ChevronRight, SortAsc, X } from "lucide-react";

const SNOOZE_OPTIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "Custom date…", days: -1 },
];

function overdueLabel(nextFollowUpAt: Date | string | null): string {
  if (!nextFollowUpAt) return "";
  const d = new Date(nextFollowUpAt as string);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Due today";
  if (diffDays === 1) return "1 day overdue";
  if (diffDays < 30) return `${diffDays} days overdue`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return "1 month overdue";
  return `${months} months overdue`;
}

function cadenceLabel(days: number | null): string {
  if (!days) return "";
  const map: Record<number, string> = { 7: "weekly", 30: "monthly", 90: "quarterly", 365: "yearly" };
  return map[days] ?? `every ${days}d`;
}

interface PersonRow {
  id: string;
  handle: string;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  relationship_type: string | null;
  cadence_days: number | null;
  last_contacted_at: Date | string | null;
  next_follow_up_at: Date | string | null;
  followup_snooze_until: Date | string | null;
  tags: { tag: { id: string; name: string; color: string | null } }[];
}

function PersonCard({ row, onSnooze }: { row: PersonRow; onSnooze: (id: string) => void }) {
  const locale = useLocale();
  const router = useRouter();
  const [logOpen, setLogOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const displayName = deriveDisplayName({
    display_name: row.display_name,
    given_name: row.given_name,
    family_name: row.family_name,
    nickname: row.nickname,
    handle: row.handle,
  });

  const utils = trpc.useUtils();
  const snoozeMutation = trpc.people.snoozeFollowUp.useMutation({
    onSuccess: () => {
      void utils.people.followUpList.invalidate();
      setSnoozeOpen(false);
      setShowCustomInput(false);
      setCustomDate("");
    },
  });

  function handleSnooze(days: number) {
    if (days === -1) {
      setShowCustomInput(true);
      return;
    }
    onSnooze(row.id);
    const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    snoozeMutation.mutate({ id: row.id, snooze_until: snoozeUntil.toISOString() });
  }

  function handleCustomDateSnooze() {
    if (!customDate) return;
    const snoozeUntil = new Date(customDate + "T23:59:59");
    if (isNaN(snoozeUntil.getTime())) return;
    onSnooze(row.id);
    snoozeMutation.mutate({ id: row.id, snooze_until: snoozeUntil.toISOString() });
  }

  return (
    <>
      <div
        className="rounded-lg border border-border-subtle bg-surface-raised hover:border-border-default transition-colors group cursor-pointer"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("a") || target.closest("input")) return;
          router.push(`/people/${row.id}`);
        }}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Link href={`/people/${row.id}`}>
              <PersonAvatar displayName={displayName} photoUrl={row.photo_url} size="sm" />
            </Link>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium text-text-primary">
                  {displayName}
                </span>
                {row.relationship_type && (
                  <span className="ml-2 text-2xs capitalize text-text-disabled border border-border-subtle rounded px-1 py-px">
                    {row.relationship_type.replace(/-/g, " ")}
                  </span>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {row.next_follow_up_at && (
                    <span className="text-xs text-text-secondary">
                      {overdueLabel(row.next_follow_up_at)}
                    </span>
                  )}
                  {row.last_contacted_at && (
                    <span className="text-xs text-text-disabled">
                      Last: {formatRelativeDate(row.last_contacted_at, locale)}
                    </span>
                  )}
                  {row.cadence_days && (
                    <span className="text-xs text-text-disabled capitalize">{cadenceLabel(row.cadence_days)}</span>
                  )}
                </div>
                {row.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {row.tags.slice(0, 4).map(({ tag }) => (
                      <span key={tag.id} className="text-2xs text-text-disabled border border-border-subtle rounded px-1">
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLogOpen(true); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border-default text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <Activity size={11} />
                  Log interaction
                </button>
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSnoozeOpen((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border-default text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    <BellOff size={11} />
                    Snooze ▾
                  </button>
                  {snoozeOpen && (
                    <div className="absolute right-0 top-full mt-1 z-dropdown w-44 rounded-lg border border-border-default bg-surface-raised shadow-2 overflow-hidden">
                      {!showCustomInput ? (
                        SNOOZE_OPTIONS.map((opt) => (
                          <button
                            key={opt.days}
                            type="button"
                            disabled={snoozeMutation.isPending}
                            onClick={() => handleSnooze(opt.days)}
                            className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
                          >
                            {opt.label}
                          </button>
                        ))
                      ) : (
                        <div className="p-2 space-y-1.5">
                          <p className="text-2xs text-text-disabled font-medium px-1">Snooze until</p>
                          <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="w-full text-xs border border-border-default rounded px-2 py-1 bg-surface-base text-text-primary outline-none"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={!customDate || snoozeMutation.isPending}
                              onClick={handleCustomDateSnooze}
                              className="flex-1 text-xs px-2 py-1 rounded bg-accent-primary text-white disabled:opacity-50"
                            >
                              Snooze
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCustomInput(false)}
                              className="text-xs px-2 py-1 rounded border border-border-default text-text-secondary hover:bg-surface-hover"
                            >
                              Back
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Link
                  href={`/people/${row.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-disabled hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {logOpen && (
        <LogInteractionModal
          personId={row.id}
          personName={displayName}
          onClose={() => setLogOpen(false)}
          onSuccess={() => {
            setLogOpen(false);
            void utils.people.followUpList.invalidate();
          }}
        />
      )}
    </>
  );
}

function FollowUpPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sort = (searchParams.get("sort") as "most_overdue" | "alphabetical") ?? "most_overdue";
  const relationshipType = searchParams.get("rel") ?? undefined;
  const tagIds = searchParams.getAll("tag");

  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());

  const setSort = useCallback((v: "most_overdue" | "alphabetical") => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sort", v);
    router.replace(`/people/follow-up?${p.toString()}`);
  }, [router, searchParams]);

  const setRelationshipType = useCallback((v: string | undefined) => {
    const p = new URLSearchParams(searchParams.toString());
    if (v) p.set("rel", v); else p.delete("rel");
    router.replace(`/people/follow-up?${p.toString()}`);
  }, [router, searchParams]);

  const toggleTag = useCallback((tagId: string) => {
    const p = new URLSearchParams(searchParams.toString());
    const existing = p.getAll("tag");
    if (existing.includes(tagId)) {
      p.delete("tag");
      existing.filter((t) => t !== tagId).forEach((t) => p.append("tag", t));
    } else {
      p.append("tag", tagId);
    }
    router.replace(`/people/follow-up?${p.toString()}`);
  }, [router, searchParams]);

  const handleSnooze = useCallback((id: string) => {
    setSnoozedIds((prev) => new Set([...prev, id]));
  }, []);

  const { data, fetchNextPage, hasNextPage, isLoading } = trpc.people.followUpList.useInfiniteQuery(
    { sort, relationship_type: relationshipType, tag_ids: tagIds.length > 0 ? tagIds : undefined, limit: 50 },
    { getNextPageParam: (page) => page.nextCursor },
  );

  const allRows = data?.pages.flatMap((p) => p.people) ?? [];
  const visible = allRows.filter((r) => !snoozedIds.has(r.id));
  const total = data?.pages[0]?.total ?? 0;

  const uniqueTags = Array.from(
    new Map(
      allRows.flatMap((r) => r.tags.map(({ tag }) => [tag.id, tag])),
    ).values(),
  );

  const uniqueRelTypes = Array.from(new Set(allRows.map((r) => r.relationship_type).filter(Boolean)));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface-base shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-text-tertiary" />
          <h1 className="text-base font-semibold text-text-primary">Follow-up</h1>
          {total > 0 && (
            <span className="ml-1 text-xs text-text-disabled border border-border-subtle rounded-full px-2">
              {total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="relative flex items-center gap-1">
            <SortAsc size={12} className="text-text-disabled" />
            <select
              className="text-xs text-text-secondary bg-transparent border-none outline-none cursor-pointer"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="most_overdue">Most overdue</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      {(uniqueRelTypes.length > 0 || uniqueTags.length > 0 || relationshipType || tagIds.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-surface-base shrink-0">
          {/* Relationship filter chips */}
          {relationshipType && (
            <button
              type="button"
              onClick={() => setRelationshipType(undefined)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs bg-accent-primary-subtle text-accent-primary border border-accent-primary/30"
            >
              {relationshipType.replace(/-/g, " ")}
              <X size={10} />
            </button>
          )}
          {!relationshipType && uniqueRelTypes.map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => setRelationshipType(rt ?? undefined)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs capitalize text-text-secondary border border-border-default hover:bg-surface-hover transition-colors"
            >
              {(rt ?? "").replace(/-/g, " ")}
            </button>
          ))}

          {/* Tag filter chips */}
          {uniqueTags.map((tag) => {
            const active = tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs border transition-colors ${
                  active
                    ? "bg-accent-primary-subtle text-accent-primary border-accent-primary/30"
                    : "text-text-secondary border-border-default hover:bg-surface-hover"
                }`}
              >
                #{tag.name}
                {active && <X size={10} />}
              </button>
            );
          })}

          {(relationshipType || tagIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                const p = new URLSearchParams(searchParams.toString());
                p.delete("rel");
                p.delete("tag");
                router.replace(`/people/follow-up?${p.toString()}`);
              }}
              className="text-2xs text-text-disabled hover:text-text-tertiary ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-text-secondary">No follow-ups due.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((row) => (
              <PersonCard key={row.id} row={row as PersonRow} onSnooze={handleSnooze} />
            ))}
            {hasNextPage && (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="w-full py-2 text-xs text-text-tertiary border border-dashed border-border-subtle rounded-lg hover:text-text-primary transition-colors"
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FollowUpPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-text-tertiary">Loading…</div>}>
      <FollowUpPageInner />
    </Suspense>
  );
}

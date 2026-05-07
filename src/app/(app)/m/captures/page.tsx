"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";
import { Inbox, ArrowRight, Sparkles } from "lucide-react";

interface CaptureItem {
  id: string;
  raw_text: string;
  title: string | null;
  tags: string[];
  state?: string;
  ai_parsed: boolean;
  created_at: Date | string;
}

function parserHint(capture: CaptureItem): string | null {
  if (capture.ai_parsed) return "AI parsed";
  if (capture.state === "raw") return "Unprocessed";
  return null;
}

function CaptureCard({ capture }: { capture: CaptureItem }) {
  const displayText = capture.title ?? capture.raw_text;
  const relativeTime = formatDistanceToNow(new Date(capture.created_at), { addSuffix: true });
  const hint = parserHint(capture);

  return (
    <li>
      <Link
        href={`/m/captures/process?id=${capture.id}`}
        className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 transition-colors active:bg-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 font-ui text-sm leading-snug text-text-primary">
            {displayText}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-ui text-xs tabular-nums text-text-tertiary">{relativeTime}</span>
            {hint && (
              <span
                className={cn(
                  "flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-ui text-[10px] font-medium",
                  capture.ai_parsed
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "bg-surface-raised text-text-tertiary",
                )}
              >
                {capture.ai_parsed && <Sparkles size={10} aria-hidden />}
                {hint}
              </span>
            )}
            {capture.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-ui text-xs text-text-tertiary"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
        <ArrowRight size={16} className="mt-1 shrink-0 text-text-disabled" aria-hidden />
      </Link>
    </li>
  );
}

export default function MobileCapturesPage() {
  const query = trpc.capture.listInbox.useQuery({ limit: 200 });
  const captures = (query.data as CaptureItem[] | undefined) ?? [];

  async function handleRefresh() {
    await query.refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="font-ui text-xl font-semibold text-text-primary">Captures</h1>
          {captures.length > 0 && (
            <Link
              href="/m/captures/process"
              className={cn(
                "flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent-primary px-3",
                "font-ui text-sm font-semibold text-white active:bg-accent-primary/90",
              )}
            >
              Process all
              <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
        {captures.length > 0 && (
          <p className="mt-1 font-ui text-sm text-text-tertiary">
            {captures.length} unprocessed {captures.length === 1 ? "capture" : "captures"}
          </p>
        )}
      </header>

      <PullToRefresh onRefresh={handleRefresh} className="flex-1">
        {query.isLoading ? (
          <ul role="list">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="space-y-2 border-b border-border-subtle px-4 py-3">
                <div className="h-4 w-full animate-pulse rounded bg-surface-raised" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-surface-raised" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-surface-raised" />
              </li>
            ))}
          </ul>
        ) : captures.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised">
              <Inbox size={32} className="text-text-tertiary" aria-hidden />
            </span>
            <div>
              <p className="font-ui text-base font-semibold text-text-primary">Inbox zero</p>
              <p className="mt-1 font-ui text-sm text-text-tertiary">
                All your captures have been processed. Tap + to capture something new.
              </p>
            </div>
          </div>
        ) : (
          <ul role="list">
            {captures.map((capture) => (
              <CaptureCard key={capture.id} capture={capture} />
            ))}
          </ul>
        )}
      </PullToRefresh>
    </div>
  );
}

"use client";

import * as React from "react";
import { CHANGELOG_ENTRIES } from "@/lib/help/changelog";
import { cn } from "@/lib/utils";

const TAG_STYLES: Record<string, string> = {
  new: "bg-accent-primary-subtle text-accent-primary",
  improved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  fixed: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500",
};

const TAG_LABELS: Record<string, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function HelpChangelog(): React.ReactElement {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <div className="mb-6">
        <h1 className="font-ui text-xl font-semibold text-text-primary">What&apos;s New</h1>
        <p className="mt-1 font-ui text-sm text-text-secondary">
          Recent updates, improvements, and fixes to Atlas.
        </p>
      </div>

      <ol className="relative border-l border-border-subtle" aria-label="Changelog">
        {CHANGELOG_ENTRIES.map((entry) => (
          <li key={entry.id} className="mb-8 ml-4">
            <div className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-border-subtle bg-surface-base" />

            <div className="mb-1 flex flex-wrap items-center gap-2">
              <time dateTime={entry.date} className="font-mono text-xs text-text-tertiary">
                {formatDate(entry.date)}
              </time>
              <span className="font-mono text-2xs text-text-disabled">v{entry.version}</span>
              <div className="flex gap-1">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-ui text-2xs font-medium",
                      TAG_STYLES[tag],
                    )}
                  >
                    {TAG_LABELS[tag]}
                  </span>
                ))}
              </div>
            </div>

            <h2 className="font-ui text-sm font-semibold text-text-primary">{entry.title}</h2>
            <p className="mt-1 font-ui text-sm leading-relaxed text-text-secondary">
              {entry.description}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

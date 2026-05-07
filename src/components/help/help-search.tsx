"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/docs";
import type { HelpArticle, HelpSection } from "@/lib/help/types";
import { cn } from "@/lib/utils";

interface SearchResult {
  article: HelpArticle;
  section: HelpSection;
}

function searchDocs(query: string): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const section of HELP_SECTIONS) {
    for (const article of section.articles) {
      if (article.title.toLowerCase().includes(q) || article.content.toLowerCase().includes(q)) {
        results.push({ article, section });
      }
    }
  }

  return results.slice(0, 6);
}

export interface HelpSearchHandle {
  focus: () => void;
}

interface HelpSearchProps {
  onNavigate: (sectionId: string, articleId: string) => void;
}

export const HelpSearch = React.forwardRef<HelpSearchHandle, HelpSearchProps>(function HelpSearch(
  { onNavigate },
  ref,
) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const results = React.useMemo(() => searchDocs(query), [query]);

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  React.useEffect(() => {
    if (query.trim()) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [query]);

  function handleSelect(sectionId: string, articleId: string) {
    setQuery("");
    setOpen(false);
    onNavigate(sectionId, articleId);
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search size={12} className="absolute left-2.5 text-text-tertiary" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search docs… (⌘F)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={cn(
            "h-7 w-full rounded-md border border-border-subtle bg-surface-sunken pl-7 pr-7 font-ui text-xs text-text-primary placeholder:text-text-tertiary",
            "focus:ring-accent-primary/30 focus:border-accent-primary focus:outline-none focus:ring-1",
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 text-text-tertiary hover:text-text-secondary"
            aria-label="Clear search"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border-default bg-surface-raised shadow-2">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 font-ui text-xs text-text-tertiary">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul>
              {results.map(({ article, section }) => (
                <li key={article.id}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelect(section.id, article.id)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="font-ui text-xs font-medium text-text-primary">
                      {article.title}
                    </span>
                    <span className="font-ui text-2xs text-text-tertiary">{section.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

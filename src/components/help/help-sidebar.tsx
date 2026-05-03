"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Sparkles, Megaphone } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/docs";
import { cn } from "@/lib/utils";
import { HelpSearch, type HelpSearchHandle } from "./help-search";

interface HelpSidebarProps {
  activeSectionId: string | null;
  activeArticleId: string | null;
  showAI: boolean;
  showChangelog: boolean;
  changelogUnread: number;
  searchRef: React.RefObject<HelpSearchHandle | null>;
  onNavigate: (sectionId: string, articleId: string) => void;
  onAskAI: () => void;
  onChangelog: () => void;
}

export function HelpSidebar({
  activeSectionId,
  activeArticleId,
  showAI,
  showChangelog,
  changelogUnread,
  searchRef,
  onNavigate,
  onAskAI,
  onChangelog,
}: HelpSidebarProps): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  function toggleSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isSectionCollapsed(id: string) {
    if (id in collapsed) return collapsed[id];
    return false;
  }

  return (
    <aside className="flex h-full w-[220px] flex-shrink-0 flex-col border-r border-border-subtle bg-surface-sunken">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3.5">
        <div className="flex size-6 items-center justify-center rounded bg-accent-primary font-mono text-sm font-bold text-white">
          A
        </div>
        <span className="font-ui text-sm font-semibold text-text-primary">Help Center</span>
      </div>

      <div className="border-b border-border-subtle px-3 py-2">
        <HelpSearch ref={searchRef} onNavigate={onNavigate} />
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Help sections">
        {HELP_SECTIONS.map((section) => {
          const isOpen = !isSectionCollapsed(section.id);
          const SectionIcon = section.icon;
          return (
            <div key={section.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 font-ui text-2xs font-semibold uppercase tracking-wider text-text-tertiary transition-colors hover:text-text-secondary"
                aria-expanded={isOpen}
              >
                <SectionIcon size={11} aria-hidden className="shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                {isOpen ? (
                  <ChevronDown size={10} aria-hidden />
                ) : (
                  <ChevronRight size={10} aria-hidden />
                )}
              </button>
              {isOpen && (
                <ul>
                  {section.articles.map((article) => {
                    const isActive =
                      activeSectionId === section.id &&
                      activeArticleId === article.id;
                    return (
                      <li key={article.id}>
                        <button
                          type="button"
                          onClick={() => onNavigate(section.id, article.id)}
                          className={cn(
                            "flex w-full items-center px-3 py-1.5 pl-6 text-left font-ui text-xs transition-colors",
                            isActive
                              ? "border-l-2 border-accent-primary bg-accent-primary-subtle pl-[22px] font-medium text-accent-primary"
                              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                          )}
                        >
                          {article.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border-subtle p-3">
        <button
          type="button"
          onClick={onChangelog}
          className={cn(
            "relative flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 font-ui text-xs font-medium transition-colors",
            showChangelog
              ? "bg-accent-primary text-white"
              : "bg-surface-hover text-text-primary hover:bg-accent-primary-subtle hover:text-accent-primary",
          )}
        >
          <Megaphone size={12} aria-hidden />
          What&apos;s New
          {!showChangelog && changelogUnread > 0 && (
            <span className="ml-auto flex size-4 items-center justify-center rounded-full bg-accent-primary font-mono text-2xs font-bold text-white">
              {changelogUnread > 9 ? "9+" : changelogUnread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onAskAI}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 font-ui text-xs font-medium transition-colors",
            showAI
              ? "bg-accent-primary text-white"
              : "bg-surface-hover text-text-primary hover:bg-accent-primary-subtle hover:text-accent-primary",
          )}
        >
          <Sparkles size={12} aria-hidden />
          Ask AI
        </button>
        <p className="text-center font-mono text-2xs text-text-tertiary">
          Atlas Help · v1.0
        </p>
      </div>
    </aside>
  );
}

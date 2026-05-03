"use client";

import * as React from "react";
import { X } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/docs";
import { HelpSidebar } from "./help-sidebar";
import { HelpArticle } from "./help-article";
import { HelpAIChat } from "./help-ai-chat";
import type { HelpSearchHandle } from "./help-search";

interface HelpShellProps {
  onClose: () => void;
}

export function HelpShell({ onClose }: HelpShellProps): React.ReactElement {
  const firstSection = HELP_SECTIONS[0]!;
  const firstArticle = firstSection.articles[0]!;

  const [activeSectionId, setActiveSectionId] = React.useState<string>(firstSection.id);
  const [activeArticleId, setActiveArticleId] = React.useState<string>(firstArticle.id);
  const [showAI, setShowAI] = React.useState(false);
  const searchRef = React.useRef<HelpSearchHandle | null>(null);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleNavigate(sectionId: string, articleId: string) {
    setActiveSectionId(sectionId);
    setActiveArticleId(articleId);
    setShowAI(false);
  }

  return (
    <div className="flex h-full w-full">
      <HelpSidebar
        activeSectionId={showAI ? null : activeSectionId}
        activeArticleId={showAI ? null : activeArticleId}
        showAI={showAI}
        searchRef={searchRef}
        onNavigate={handleNavigate}
        onAskAI={() => setShowAI(true)}
      />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Help Center"
          className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          <X size={16} aria-hidden />
        </button>

        <div className="flex-1 overflow-y-auto">
          {showAI ? (
            <HelpAIChat />
          ) : (
            <HelpArticle
              sectionId={activeSectionId}
              articleId={activeArticleId}
              onNavigate={handleNavigate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

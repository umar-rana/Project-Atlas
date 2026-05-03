"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/docs";
import { cn } from "@/lib/utils";

interface HelpArticleProps {
  sectionId: string;
  articleId: string;
  onNavigate: (sectionId: string, articleId: string) => void;
}

function renderContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    const h3Match = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (h3Match && !h3Match[1]!.includes("**")) {
      nodes.push(
        <h3
          key={i}
          className="mt-6 mb-2 font-ui text-2xs font-semibold uppercase tracking-wider text-text-tertiary first:mt-0"
        >
          {h3Match![1]}
        </h3>,
      );
      i++;
      continue;
    }

    if (line.startsWith("|") && line.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        tableLines.push(lines[i]!);
        i++;
      }
      const rows = tableLines
        .filter((l) => !l.match(/^\|[-| ]+\|$/))
        .map((l) =>
          l
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim()),
        );
      if (rows.length > 0) {
        const [header, ...body] = rows;
        nodes.push(
          <div key={i} className="my-4 overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  {header!.map((cell, ci) => (
                    <th
                      key={ci}
                      className="py-1.5 pr-4 text-left font-semibold text-text-primary"
                    >
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr
                    key={ri}
                    className={cn(
                      "border-b border-border-subtle/50",
                      ri % 2 === 0 ? "bg-surface-base" : "bg-surface-sunken/30",
                    )}
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-1.5 pr-4 text-text-secondary">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) {
        items.push(lines[i]!.slice(2));
        i++;
      }
      nodes.push(
        <ul key={i} className="my-3 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className="text-text-secondary">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\. /);
    if (orderedMatch) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.match(/^\d+\. /)) {
        items.push(lines[i]!.replace(/^\d+\. /, ""));
        i++;
      }
      nodes.push(
        <ol key={i} className="my-3 list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className="text-text-secondary">
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    nodes.push(
      <p key={i} className="my-2 leading-7 text-text-secondary">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[11px] text-text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function HelpArticle({
  sectionId,
  articleId,
  onNavigate,
}: HelpArticleProps): React.ReactElement | null {
  const section = HELP_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return null;

  const articleIndex = section.articles.findIndex((a) => a.id === articleId);
  const article = section.articles[articleIndex];
  if (!article) return null;

  const nextArticle = section.articles[articleIndex + 1];
  let nextSection: typeof HELP_SECTIONS[0] | undefined;
  let nextSectionFirstArticle: typeof section.articles[0] | undefined;

  if (!nextArticle) {
    const sectionIndex = HELP_SECTIONS.findIndex((s) => s.id === sectionId);
    nextSection = HELP_SECTIONS[sectionIndex + 1];
    nextSectionFirstArticle = nextSection?.articles[0];
  }

  return (
    <article className="mx-auto w-full max-w-[660px] px-8 py-8 font-ui text-sm">
      <h1 className="mb-6 font-ui text-xl font-semibold text-text-primary">
        {article.title}
      </h1>
      <div className="leading-[1.8]">{renderContent(article.content)}</div>

      {(nextArticle ?? nextSectionFirstArticle) && (
        <div className="mt-10 border-t border-border-subtle pt-6">
          <button
            type="button"
            onClick={() => {
              if (nextArticle) {
                onNavigate(sectionId, nextArticle.id);
              } else if (nextSection && nextSectionFirstArticle) {
                onNavigate(nextSection.id, nextSectionFirstArticle.id);
              }
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-raised p-4 text-left transition-colors hover:bg-surface-hover"
          >
            <div>
              <p className="text-2xs uppercase tracking-wider text-text-tertiary">
                Next article
              </p>
              <p className="mt-0.5 font-medium text-text-primary">
                {nextArticle?.title ?? nextSectionFirstArticle?.title}
              </p>
            </div>
            <ArrowRight size={16} className="shrink-0 text-text-tertiary" aria-hidden />
          </button>
        </div>
      )}
    </article>
  );
}

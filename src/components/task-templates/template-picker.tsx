"use client";

import * as React from "react";
import { LayoutTemplate, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

export interface TemplateFields {
  title: string;
  notes: string | null;
  flagged: boolean;
  estimated_minutes: number | null;
  recurrence_rule: string | null;
  default_project_id: string | null;
  context_ids: string[];
  tag_ids: string[];
  checklist_items: Array<{ title: string; position: string }>;
}

interface TemplatePickerProps {
  onSelect: (fields: TemplateFields, templateId: string) => void;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export function TemplatePicker({
  onSelect,
  className,
  side = "bottom",
  align = "start",
}: TemplatePickerProps): React.ReactElement {
  const [showAll, setShowAll] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const topN = trpc.taskTemplates.list.useQuery({ topN: 10 }, { staleTime: 30_000, enabled: open });
  const all = trpc.taskTemplates.list.useQuery(
    { limit: 200 },
    { staleTime: 30_000, enabled: open && showAll },
  );

  const templates = showAll ? (all.data ?? []) : (topN.data ?? []);

  function handleSelect(template: (typeof templates)[0]) {
    onSelect(
      {
        title: template.name,
        notes: template.notes,
        flagged: template.flagged,
        estimated_minutes: template.estimated_minutes,
        recurrence_rule: template.recurrence_rule,
        default_project_id: template.default_project_id,
        context_ids: template.contexts.map((c) => c.context_id),
        tag_ids: template.tags.map((t) => t.tag_id),
        checklist_items: template.checklist_items.map((item) => ({
          title: item.title,
          position: item.position.toString(),
        })),
      },
      template.id,
    );
    setOpen(false);
    setShowAll(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Hint label="Use a template" side="top">
          <button
            type="button"
            aria-label="From template"
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border border-border-default px-2 py-1 font-ui text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
              className,
            )}
          >
            <LayoutTemplate size={12} aria-hidden />
            <span>Template</span>
            <ChevronDown size={10} aria-hidden />
          </button>
        </Hint>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-64">
        {templates.length === 0 && (
          <div className="px-3 py-4 text-center font-ui text-xs text-text-tertiary">
            No templates yet. Create one in Settings → Templates.
          </div>
        )}
        {templates.map((template) => (
          <DropdownMenuItem key={template.id} onSelect={() => handleSelect(template)}>
            <div className="flex flex-col gap-0.5">
              <span className="font-ui text-sm text-text-primary">{template.name}</span>
              {template.default_project && (
                <span className="font-ui text-2xs text-text-tertiary">
                  {template.default_project.title}
                </span>
              )}
            </div>
            {template.usage_count > 0 && (
              <span className="ml-auto font-ui text-2xs text-text-disabled">
                ×{template.usage_count}
              </span>
            )}
          </DropdownMenuItem>
        ))}
        {!showAll && (topN.data?.length ?? 0) >= 10 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setShowAll(true);
              }}
            >
              <span className="font-ui text-xs text-text-tertiary">All templates…</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

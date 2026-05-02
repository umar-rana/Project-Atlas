"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectType = "project" | "goal" | "habit";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  project: "Project",
  goal: "Goal",
  habit: "Habit",
};

export const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  project: "📁",
  goal: "🎯",
  habit: "🔁",
};

export function ProjectTypeSelector({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ProjectType;
  onChange: (type: ProjectType) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs font-medium transition-colors",
          "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span>{PROJECT_TYPE_ICONS[value]}</span>
        <span>{PROJECT_TYPE_LABELS[value]}</span>
        <ChevronDown size={10} className="text-text-tertiary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((t) => (
          <DropdownMenuItem
            key={t}
            onSelect={() => onChange(t)}
            className={t === value ? "font-semibold text-accent-primary" : ""}
          >
            <span className="mr-2">{PROJECT_TYPE_ICONS[t]}</span>
            {PROJECT_TYPE_LABELS[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

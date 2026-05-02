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

export type ProjectStatus = "active" | "on_hold" | "completed" | "dropped";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "Paused",
  completed: "Completed",
  dropped: "Abandoned",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "text-accent-info",
  on_hold: "text-text-secondary",
  completed: "text-accent-success",
  dropped: "text-text-tertiary",
};

export function ProjectStatusSelector({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs font-medium transition-colors",
          "hover:bg-surface-hover",
          STATUS_COLOR[value] ?? "text-text-secondary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {PROJECT_STATUS_LABELS[value] ?? value}
        <ChevronDown size={10} className="text-text-tertiary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => onChange(s)}
            className={s === value ? "font-semibold text-accent-primary" : ""}
          >
            {PROJECT_STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

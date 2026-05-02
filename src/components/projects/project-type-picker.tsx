"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { getSuggestedTypes, displayType } from "@/core/projects/type-suggestions";
import { CustomTypeDialog } from "./custom-type-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ProjectTypePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (type: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [showCustom, setShowCustom] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const typesQuery = trpc.projects.distinctTypes.useQuery(undefined, {
    staleTime: 30_000,
  });
  const existingTypes = (typesQuery.data ?? []).map((t) => t.type);
  const suggestions = getSuggestedTypes(typesQuery.data ?? []);

  function handleSelect(type: string) {
    setOpen(false);
    onChange(type);
  }

  function handleCustomConfirm(type: string) {
    setShowCustom(false);
    setOpen(false);
    onChange(type);
  }

  return (
    <div className="relative">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs font-medium transition-colors",
            "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span>{displayType(value)}</span>
          <ChevronDown size={10} className="text-text-tertiary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="font-ui text-3xs uppercase tracking-caps text-text-disabled">Core</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => handleSelect("project")}
            className={value === "project" ? "font-semibold text-accent-primary" : ""}
          >
            📁 Project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => handleSelect("goal")}
            className={value === "goal" ? "font-semibold text-accent-primary" : ""}
          >
            🎯 Goal
          </DropdownMenuItem>

          {suggestions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-ui text-3xs uppercase tracking-caps text-text-disabled">Suggested</DropdownMenuLabel>
              {suggestions.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => handleSelect(s)}
                  className={value === s ? "font-semibold text-accent-primary" : ""}
                >
                  {displayType(s)}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {existingTypes.filter((t) => t !== "project" && t !== "goal" && !suggestions.includes(t)).length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-ui text-3xs uppercase tracking-caps text-text-disabled">Your types</DropdownMenuLabel>
              {existingTypes
                .filter((t) => t !== "project" && t !== "goal" && !suggestions.includes(t))
                .map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onSelect={() => handleSelect(t)}
                    className={value === t ? "font-semibold text-accent-primary" : ""}
                  >
                    {displayType(t)}
                  </DropdownMenuItem>
                ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setShowCustom(true);
            }}
            className="text-text-tertiary"
          >
            Custom type…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCustom && (
        <CustomTypeDialog
          existingTypes={existingTypes}
          onConfirm={handleCustomConfirm}
          onCancel={() => setShowCustom(false)}
        />
      )}
    </div>
  );
}

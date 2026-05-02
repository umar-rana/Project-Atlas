"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { displayType } from "@/core/projects/type-suggestions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TypeCount {
  type: string;
  count: number;
}

const MAX_VISIBLE = 3;

export function ProjectTypeFilterPills({
  typeCounts,
}: {
  typeCounts: TypeCount[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type");

  function setFilter(type: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (type) {
      params.set("type", type);
    } else {
      params.delete("type");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // If the active type no longer exists in typeCounts (orphaned URL state),
  // the "All" pill will be highlighted so the user can recover naturally.
  const activeTypeIsOrphaned =
    !!activeType && !typeCounts.find((t) => t.type === activeType);

  const sorted = [...typeCounts].sort((a, b) => b.count - a.count);

  let visibleTypes = sorted.slice(0, MAX_VISIBLE);
  let overflowTypes = sorted.slice(MAX_VISIBLE);

  if (activeType && !visibleTypes.find((t) => t.type === activeType)) {
    const activeInOverflow = overflowTypes.find((t) => t.type === activeType);
    if (activeInOverflow) {
      const leastUsedVisible = visibleTypes[visibleTypes.length - 1];
      if (leastUsedVisible) {
        visibleTypes = [
          ...visibleTypes.slice(0, visibleTypes.length - 1),
          activeInOverflow,
        ];
        overflowTypes = [
          leastUsedVisible,
          ...overflowTypes.filter((t) => t.type !== activeType),
        ];
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border-subtle">
      <button
        type="button"
        onClick={() => setFilter(null)}
        className={cn(
          "rounded-full px-3 py-0.5 font-ui text-2xs font-medium transition-colors",
          !activeType || activeTypeIsOrphaned
            ? "bg-accent-primary text-text-on-accent"
            : "border border-border-default text-text-secondary hover:bg-surface-hover",
        )}
      >
        All
      </button>

      {visibleTypes.map(({ type, count }) => (
        <button
          key={type}
          type="button"
          onClick={() => setFilter(type)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-ui text-2xs font-medium transition-colors",
            activeType === type
              ? "bg-accent-primary text-text-on-accent"
              : "border border-border-default text-text-secondary hover:bg-surface-hover",
          )}
        >
          {displayType(type)}
          <span className={cn(
            "font-mono text-3xs tabular-nums",
            activeType === type ? "text-text-on-accent opacity-70" : "text-text-disabled",
          )}>
            {count}
          </span>
        </button>
      ))}

      {overflowTypes.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-3 py-0.5 font-ui text-2xs font-medium transition-colors",
              overflowTypes.some((t) => t.type === activeType)
                ? "bg-accent-primary text-text-on-accent"
                : "border border-border-default text-text-secondary hover:bg-surface-hover",
            )}
          >
            More
            <ChevronDown size={10} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {overflowTypes.map(({ type, count }) => (
              <DropdownMenuItem
                key={type}
                onSelect={() => setFilter(type)}
                className={activeType === type ? "font-semibold text-accent-primary" : ""}
              >
                <span className="flex-1">{displayType(type)}</span>
                <span className="ml-3 font-mono text-2xs text-text-disabled tabular-nums">{count}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

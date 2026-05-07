"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ReferenceTrigger = "@" | "#" | "[[";

export interface ReferenceItem {
  id: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  hint?: string;
}

export interface ReferenceAutocompleteProps {
  /**
   * The trigger character that opens this autocomplete (e.g. "@", "#", "[[").
   * Used as a label hint and rendered above the list.
   */
  triggerChar: ReferenceTrigger;
  /**
   * Async lookup invoked on every query change. Should return the items to
   * render (already filtered/ranked by the caller). The returned items keep
   * their `group` for cmdk grouping.
   */
  searchFn: (query: string) => ReferenceItem[] | Promise<ReferenceItem[]>;
  /** Current query string (text after the trigger char). */
  query: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ReferenceItem) => void;
  /** Anchor element (typically the input wrapper). */
  children: React.ReactNode;
  /** Empty-state copy when no items match. */
  emptyText?: string;
}

/**
 * ReferenceAutocomplete — popover-anchored cmdk list driven by a trigger
 * character. The caller supplies an async `searchFn(query)` so this primitive
 * stays generic across people / tags / entities / files / arbitrary
 * data sources. Wave 1 binds this to the rich-text editor.
 */
export function ReferenceAutocomplete({
  triggerChar,
  searchFn,
  query,
  open,
  onOpenChange,
  onSelect,
  children,
  emptyText = "No matches",
}: ReferenceAutocompleteProps): React.ReactElement {
  const [items, setItems] = React.useState<ReferenceItem[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(searchFn(query)).then((result) => {
      if (!cancelled) setItems(result);
    });
    return () => {
      cancelled = true;
    };
  }, [searchFn, query]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, ReferenceItem[]>();
    items.forEach((item) => {
      const key = item.group ?? "Suggestions";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries());
  }, [items]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-autocomplete p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <CommandPrimitive
          label={`Reference autocomplete (${triggerChar})`}
          className="flex flex-col"
          shouldFilter={false}
        >
          <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5 font-mono text-2xs text-text-tertiary">
            <span aria-hidden>{triggerChar}</span>
            <span className="text-text-secondary">{query || "Type to search"}</span>
          </div>
          <CommandPrimitive.List className="max-h-autocomplete overflow-y-auto p-1">
            {items.length === 0 ? (
              <CommandPrimitive.Empty className="px-2 py-3 text-center text-2xs text-text-tertiary">
                {emptyText}
              </CommandPrimitive.Empty>
            ) : null}
            {grouped.map(([group, list]) => (
              <CommandPrimitive.Group
                key={group}
                heading={group}
                className={cn(
                  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2",
                  "[&_[cmdk-group-heading]]:font-ui [&_[cmdk-group-heading]]:text-3xs",
                  "[&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase",
                  "[&_[cmdk-group-heading]]:tracking-caps [&_[cmdk-group-heading]]:text-text-tertiary",
                )}
              >
                {list.map((item) => (
                  <CommandPrimitive.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => onSelect(item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm text-text-primary",
                      "data-[selected=true]:bg-accent-primary-subtle",
                    )}
                  >
                    {item.icon ? <span className="text-text-tertiary">{item.icon}</span> : null}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint ? (
                      <span className="font-mono text-2xs text-text-tertiary">{item.hint}</span>
                    ) : null}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

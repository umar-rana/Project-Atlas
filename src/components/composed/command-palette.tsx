"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";

export interface CommandItem {
  id: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  onRun: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  emptyText?: string;
  enableShortcut?: boolean;
  onQueryChange?: (query: string) => void;
  searchItems?: CommandItem[];
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = "Search commands…",
  emptyText = "No commands match",
  enableShortcut = true,
  onQueryChange,
  searchItems,
}: CommandPaletteProps): React.ReactElement {
  React.useEffect(() => {
    if (!enableShortcut) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [enableShortcut, onOpenChange, open]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    items.forEach((item) => {
      const key = item.group ?? "Commands";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries());
  }, [items]);

  const hasSearchItems = searchItems && searchItems.length > 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal-backdrop bg-surface-scrim-modal backdrop-blur-overlay data-[state=open]:animate-atlas-fade-in" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-modal-top-cmd z-modal-content w-modal-base max-w-modal-cmd -translate-x-1/2 overflow-hidden rounded-xl border border-border-default bg-surface-overlay shadow-4 data-[state=open]:animate-atlas-modal-in"
          aria-label="Command palette"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <CommandPrimitive label="Command palette" className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
              <Search size={14} className="text-text-tertiary" aria-hidden />
              <CommandPrimitive.Input
                placeholder={placeholder}
                onValueChange={onQueryChange}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-ui text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
              <KeyboardShortcut keys={["esc"]} variant="subtle" />
            </div>
            <CommandPrimitive.List className="max-h-menu-cmd overflow-y-auto p-1">
              <CommandPrimitive.Empty className="px-3 py-6 text-center text-xs text-text-tertiary">
                {emptyText}
              </CommandPrimitive.Empty>

              {hasSearchItems && (
                <CommandPrimitive.Group
                  heading="Search results"
                  className={cn(
                    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2",
                    "[&_[cmdk-group-heading]]:font-ui [&_[cmdk-group-heading]]:text-3xs",
                    "[&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase",
                    "[&_[cmdk-group-heading]]:tracking-caps [&_[cmdk-group-heading]]:text-text-tertiary",
                  )}
                >
                  {searchItems!.map((item) => (
                    <CommandPrimitive.Item
                      key={item.id}
                      value={`search-result ${item.id} ${item.label}`}
                      forceMount
                      onSelect={() => {
                        item.onRun();
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary",
                        "data-[selected=true]:bg-accent-primary-subtle",
                      )}
                    >
                      {item.icon ? <span className="text-text-tertiary">{item.icon}</span> : null}
                      <span className="flex-1 truncate">{item.label}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}

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
                      value={`${group} ${item.label}`}
                      onSelect={() => {
                        item.onRun();
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary",
                        "data-[selected=true]:bg-accent-primary-subtle",
                      )}
                    >
                      {item.icon ? <span className="text-text-tertiary">{item.icon}</span> : null}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut ? <KeyboardShortcut keys={item.shortcut} variant="subtle" /> : null}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

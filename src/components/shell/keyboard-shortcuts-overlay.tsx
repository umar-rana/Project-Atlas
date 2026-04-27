"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { useShellStore } from "@/lib/shell/store";
import { useShortcutsRegistry, useRegisterShortcuts } from "@/core/shortcuts/registry";

const WAVE2_SHORTCUTS = [
  { id: "s-tasks",     label: "Tasks",              group: "Navigation", keys: ["cmd", "1"] },
  { id: "s-calendar",  label: "Calendar",            group: "Navigation", keys: ["cmd", "2"] },
  { id: "s-people",    label: "People",              group: "Navigation", keys: ["cmd", "3"] },
  { id: "s-notes",     label: "Notes",               group: "Navigation", keys: ["cmd", "4"] },
  { id: "s-journals",  label: "Journals",            group: "Navigation", keys: ["cmd", "5"] },
  { id: "s-documents", label: "Documents",           group: "Navigation", keys: ["cmd", "6"] },
  { id: "s-settings",  label: "Open Settings",       group: "Navigation", keys: ["cmd", ","] },
  { id: "s-palette",   label: "Command Palette",     group: "Global",     keys: ["cmd", "K"] },
  { id: "s-shortcuts", label: "Keyboard Shortcuts",  group: "Global",     keys: ["cmd", "/"] },
  { id: "s-capture",   label: "Quick Capture",       group: "Global",     keys: ["cmd", "shift", "I"] },
  { id: "s-inspector", label: "Toggle Inspector",    group: "Global",     keys: ["cmd", "\\"] },
];

function ShortcutSeeder(): null {
  useRegisterShortcuts(WAVE2_SHORTCUTS);
  return null;
}

export function KeyboardShortcutsOverlay(): React.ReactElement {
  const shortcutsOverlayOpen = useShellStore((s) => s.shortcutsOverlayOpen);
  const setShortcutsOverlayOpen = useShellStore((s) => s.setShortcutsOverlayOpen);
  const { shortcuts } = useShortcutsRegistry();
  const [search, setSearch] = React.useState("");

  const filtered = search
    ? shortcuts.filter((s) => s.label.toLowerCase().includes(search.toLowerCase()))
    : shortcuts;

  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof shortcuts>();
    filtered.forEach((s) => {
      const key = s.group ?? "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <ShortcutSeeder />
      <Dialog open={shortcutsOverlayOpen} onOpenChange={setShortcutsOverlayOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="px-4 pt-2 pb-1">
            <input
              autoFocus
              type="search"
              placeholder="Search shortcuts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
          </div>
          <div className="max-h-96 overflow-y-auto px-4 pb-4">
            {grouped.length === 0 ? (
              <p className="py-6 text-center font-ui text-sm text-text-tertiary">No shortcuts found</p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="mb-4">
                  <h3 className="mb-1.5 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
                    {group}
                  </h3>
                  <div className="flex flex-col gap-1">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-sm py-1">
                        <span className="font-ui text-sm text-text-primary">{item.label}</span>
                        <KeyboardShortcut keys={item.keys} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

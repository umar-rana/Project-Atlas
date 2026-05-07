"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Calendar,
  Users,
  FileText,
  BookOpen,
  Vault,
  Settings,
  Activity,
  Moon,
  Sun,
  Monitor,
  Plus,
  Keyboard,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { CommandPalette } from "@/components/composed/command-palette";
import { useShellStore } from "@/lib/shell/store";
import { useCommandRegistry, useRegisterCommands } from "@/core/commands/registry";
import type { CommandItem } from "@/core/commands/registry";
import { toast } from "@/lib/toast";

function Wave2Commands(): null {
  const router = useRouter();
  const { setTheme } = useTheme();
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const setShortcutsOverlayOpen = useShellStore((s) => s.setShortcutsOverlayOpen);

  function changeTheme(value: "light" | "dark" | "system") {
    setTheme(value);
    toast.success(`Theme: ${value.charAt(0).toUpperCase() + value.slice(1)}`, { duration: 2000 });
  }

  useRegisterCommands([
    {
      id: "nav-tasks",
      label: "Go to Tasks",
      group: "Navigation",
      icon: <CheckSquare size={14} />,
      shortcut: ["⌘", "1"],
      onRun: () => router.push("/tasks"),
    },
    {
      id: "nav-calendar",
      label: "Go to Calendar",
      group: "Navigation",
      icon: <Calendar size={14} />,
      shortcut: ["⌘", "2"],
      onRun: () => router.push("/calendar"),
    },
    {
      id: "nav-people",
      label: "Go to People",
      group: "Navigation",
      icon: <Users size={14} />,
      shortcut: ["⌘", "3"],
      onRun: () => router.push("/people"),
    },
    {
      id: "nav-notes",
      label: "Go to Notes",
      group: "Navigation",
      icon: <FileText size={14} />,
      shortcut: ["⌘", "4"],
      onRun: () => router.push("/notes"),
    },
    {
      id: "nav-journals",
      label: "Go to Journals",
      group: "Navigation",
      icon: <BookOpen size={14} />,
      shortcut: ["⌘", "5"],
      onRun: () => router.push("/journals"),
    },
    {
      id: "nav-vault",
      label: "Go to Vault",
      group: "Navigation",
      icon: <Vault size={14} />,
      shortcut: ["⌘", "6"],
      onRun: () => router.push("/vault"),
    },
    {
      id: "nav-settings",
      label: "Open Settings",
      group: "Navigation",
      icon: <Settings size={14} />,
      shortcut: ["⌘", ","],
      onRun: () => router.push("/settings"),
    },
    {
      id: "nav-health",
      label: "System Health",
      group: "Navigation",
      icon: <Activity size={14} />,
      onRun: () => router.push("/admin/health"),
    },
    {
      id: "app-capture",
      label: "Quick Capture",
      group: "Actions",
      icon: <Plus size={14} />,
      shortcut: ["⌘", "⇧", "I"],
      onRun: () => setCaptureModalOpen(true),
    },
    {
      id: "app-shortcuts",
      label: "Keyboard Shortcuts",
      group: "Actions",
      icon: <Keyboard size={14} />,
      shortcut: ["⌘", "/"],
      onRun: () => setShortcutsOverlayOpen(true),
    },
    {
      id: "theme-dark",
      label: "Switch to Dark Theme",
      group: "Appearance",
      icon: <Moon size={14} />,
      onRun: () => changeTheme("dark"),
    },
    {
      id: "theme-light",
      label: "Switch to Light Theme",
      group: "Appearance",
      icon: <Sun size={14} />,
      onRun: () => changeTheme("light"),
    },
    {
      id: "theme-system",
      label: "Switch to System Theme",
      group: "Appearance",
      icon: <Monitor size={14} />,
      onRun: () => changeTheme("system"),
    },
    {
      id: "app-signout",
      label: "Sign Out",
      group: "Account",
      icon: <LogOut size={14} />,
      onRun: () => {
        toast("Signing out…", { duration: 2000 });
        setTimeout(() => {
          window.location.href = "/api/auth/logout";
        }, 600);
      },
    },
  ]);

  return null;
}

export function CommandPaletteWired(): React.ReactElement {
  const commandPaletteOpen = useShellStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useShellStore((s) => s.setCommandPaletteOpen);
  const { commands, searchProviders } = useCommandRegistry();
  const [searchItems, setSearchItems] = React.useState<CommandItem[]>([]);
  const queryRef = React.useRef<string>("");

  const handleQueryChange = React.useCallback(
    async (q: string) => {
      queryRef.current = q;
      if (!q.trim() || searchProviders.length === 0) {
        setSearchItems([]);
        return;
      }

      const results = await Promise.all(
        searchProviders.map((p) => Promise.resolve(p.search(q)).catch(() => [] as CommandItem[])),
      );
      if (queryRef.current !== q) return;
      setSearchItems(results.flat());
    },
    [searchProviders],
  );

  React.useEffect(() => {
    if (!commandPaletteOpen) setSearchItems([]);
  }, [commandPaletteOpen]);

  return (
    <>
      <Wave2Commands />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commands}
        onQueryChange={handleQueryChange}
        searchItems={searchItems}
        enableShortcut
      />
    </>
  );
}

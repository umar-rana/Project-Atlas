"use client";

import * as React from "react";
import { Plus, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { TopBar } from "@/components/layout/top-bar";
import { UserMenu } from "@/components/shell/user-menu";
import { SyncStatus } from "@/components/shell/sync-status";
import { TopbarHelpMenu } from "@/components/shell/topbar-help-menu";
import { useShellStore } from "@/lib/shell/store";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

interface TopBarWiredProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
  };
  isAdmin?: boolean;
}

function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const currentLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
  const tooltipLabel = `Theme: ${currentLabel} — click to cycle`;

  function handleThemeToggle() {
    setTheme(next);
    toast.success(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, { duration: 2000 });
  }

  return (
    <Tooltip content={tooltipLabel} side="bottom">
      <button
        type="button"
        aria-label={tooltipLabel}
        onClick={handleThemeToggle}
        className={cn(
          "relative grid size-8 place-items-center rounded-md text-text-tertiary transition-colors duration-fast ease-standard",
          "hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
        )}
      >
        {theme === "light" ? (
          <Sun size={16} aria-hidden />
        ) : theme === "dark" ? (
          <Moon size={16} aria-hidden />
        ) : (
          <Monitor size={16} aria-hidden />
        )}
      </button>
    </Tooltip>
  );
}

export function TopBarWired({ user, isAdmin }: TopBarWiredProps): React.ReactElement {
  const setCommandPaletteOpen = useShellStore((s) => s.setCommandPaletteOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);

  const captureNode = (
    <Tooltip content="Quick capture" shortcut={["⌘", "⇧", "I"]} side="bottom">
      <button
        type="button"
        aria-label="Quick capture (⌘⇧I)"
        onClick={() => setCaptureModalOpen(true)}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
          "bg-accent-primary text-text-on-accent",
          "transition-colors duration-fast ease-standard",
          "hover:bg-accent-primary-hover focus-visible:focus-ring",
        )}
      >
        <Plus size={16} aria-hidden />
      </button>
    </Tooltip>
  );

  const trailing = (
    <>
      <ThemeToggle />
      <TopbarHelpMenu />
      <SyncStatus />
      <UserMenu name={user.name} email={user.email} image={user.image} isAdmin={isAdmin} />
    </>
  );

  return (
    <TopBar
      captureNode={captureNode}
      trailing={trailing}
      onOpenSearch={() => setCommandPaletteOpen(true)}
    />
  );
}

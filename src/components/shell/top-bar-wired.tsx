"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Inbox } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { UserMenu } from "@/components/shell/user-menu";
import { SyncStatus } from "@/components/shell/sync-status";
import { useShellStore } from "@/lib/shell/store";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MODULE_LABELS: Record<string, string> = {
  tasks: "Tasks",
  calendar: "Calendar",
  crm: "CRM",
  notes: "Notes",
  journal: "Journal",
  settings: "Settings",
  health: "System Health",
  trash: "Trash",
};

function getModuleLabel(pathname: string): string {
  if (pathname.startsWith("/tasks")) return MODULE_LABELS.tasks!;
  if (pathname.startsWith("/calendar")) return MODULE_LABELS.calendar!;
  if (pathname.startsWith("/crm")) return MODULE_LABELS.crm!;
  if (pathname.startsWith("/notes")) return MODULE_LABELS.notes!;
  if (pathname.startsWith("/journal")) return MODULE_LABELS.journal!;
  if (pathname.startsWith("/settings")) return MODULE_LABELS.settings!;
  if (pathname.startsWith("/admin/health")) return MODULE_LABELS.health!;
  if (pathname.startsWith("/trash")) return MODULE_LABELS.trash!;
  return "Atlas";
}

interface TopBarWiredProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
  };
}

export function TopBarWired({ user }: TopBarWiredProps): React.ReactElement {
  const pathname = usePathname();
  const setCommandPaletteOpen = useShellStore((s) => s.setCommandPaletteOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);

  const leading = (
    <span className="font-ui text-sm font-semibold text-text-primary">
      {getModuleLabel(pathname)}
    </span>
  );

  const trailing = (
    <>
      <SyncStatus />
      <Tooltip content="Quick capture" shortcut={["⌘", "⇧", "I"]} side="bottom">
        <button
          type="button"
          aria-label="Quick capture"
          onClick={() => setCaptureModalOpen(true)}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast ease-standard",
            "hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
          )}
        >
          <Inbox size={16} aria-hidden />
        </button>
      </Tooltip>
      <UserMenu name={user.name} email={user.email} image={user.image} />
    </>
  );

  return (
    <TopBar
      leading={leading}
      trailing={trailing}
      onOpenSearch={() => setCommandPaletteOpen(true)}
    />
  );
}

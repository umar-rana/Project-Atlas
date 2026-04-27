"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { UserMenu } from "@/components/shell/user-menu";
import { SyncStatus } from "@/components/shell/sync-status";
import { useShellStore } from "@/lib/shell/store";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TopBarWiredProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
  };
}

export function TopBarWired({ user }: TopBarWiredProps): React.ReactElement {
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
          "bg-accent-primary text-white",
          "transition-colors duration-fast ease-standard",
          "hover:bg-accent-primary/90 focus-visible:focus-ring",
        )}
      >
        <Plus size={16} aria-hidden />
      </button>
    </Tooltip>
  );

  const trailing = (
    <>
      <SyncStatus />
      <UserMenu name={user.name} email={user.email} image={user.image} />
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

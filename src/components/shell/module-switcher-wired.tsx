"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckSquare,
  Calendar,
  Users,
  FileText,
  BookOpen,
  Vault,
  Trash2,
  HardDrive,
  CircleHelp,
} from "lucide-react";
import { ModuleSwitcher } from "@/components/layout/module-switcher";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { useShellStore } from "@/lib/shell/store";
import { getUnreadCount, CHANGELOG_LS_KEY } from "@/lib/help/changelog";

const MODULES = [
  { id: "tasks",     label: "Tasks",     icon: CheckSquare,   href: "/tasks",     shortcut: ["⌘", "1"] },
  { id: "calendar",  label: "Calendar",  icon: Calendar,      href: "/calendar",  shortcut: ["⌘", "2"] },
  { id: "people",    label: "People",    icon: Users,         href: "/people",    shortcut: ["⌘", "3"] },
  { id: "notes",     label: "Notes",     icon: FileText,      href: "/notes",     shortcut: ["⌘", "4"] },
  { id: "journals",  label: "Journals",  icon: BookOpen,      href: "/journals",  shortcut: ["⌘", "5"] },
  { id: "vault",     label: "Vault",     icon: Vault,         href: "/vault",     shortcut: ["⌘", "6"] },
];

function getModuleId(pathname: string): string {
  if (pathname.startsWith("/tasks"))     return "tasks";
  if (pathname.startsWith("/calendar"))  return "calendar";
  if (pathname.startsWith("/people"))    return "people";
  if (pathname.startsWith("/notes"))     return "notes";
  if (pathname.startsWith("/journals"))  return "journals";
  if (pathname.startsWith("/vault"))     return "vault";
  if (pathname.startsWith("/media"))     return "media";
  if (pathname.startsWith("/settings"))  return "settings";
  if (pathname.startsWith("/admin"))     return "health";
  if (pathname.startsWith("/usage"))     return "health";
  return "tasks";
}

export function ModuleSwitcherWired(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const active = getModuleId(pathname);
  const helpOpen = useShellStore((s) => s.helpOpen);
  const setHelpOpen = useShellStore((s) => s.setHelpOpen);
  const [changelogUnread, setChangelogUnread] = React.useState(0);

  React.useEffect(() => {
    setChangelogUnread(getUnreadCount());
  }, [helpOpen]);

  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === CHANGELOG_LS_KEY) {
        setChangelogUnread(getUnreadCount());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  React.useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const map: Record<string, string> = {
        "1": "/tasks",
        "2": "/calendar",
        "3": "/people",
        "4": "/notes",
        "5": "/journals",
        "6": "/vault",
        "8": "/media",
      };
      if (map[e.key]) {
        e.preventDefault();
        router.push(map[e.key]!);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [router]);

  const footer = (
    <>
      <div className="h-px w-6 bg-border-subtle" />
      <Hint label="Media inbox" shortcut="⌘8" side="right">
        <Link
          href="/media"
          aria-label="Media inbox (⌘8)"
          className={cn(
            "relative grid size-8 place-items-center rounded-md transition-colors duration-fast ease-standard",
            active === "media"
              ? "bg-accent-primary-subtle text-accent-primary"
              : "text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
          )}
        >
          <HardDrive size={16} aria-hidden />
        </Link>
      </Hint>
      <Hint label="Trash" side="right">
        <Link
          href="/trash"
          aria-label="Trash"
          className={cn(
            "relative grid size-8 place-items-center rounded-md text-text-tertiary transition-colors duration-fast ease-standard",
            "hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
          )}
        >
          <Trash2 size={16} aria-hidden />
        </Link>
      </Hint>
      <div className="h-px w-6 bg-border-subtle" />
      <Hint label="Help Center" shortcut="?" side="right">
        <button
          type="button"
          aria-label="Help Center"
          onClick={() => setHelpOpen(true)}
          className={cn(
            "relative grid size-8 place-items-center rounded-md transition-colors duration-fast ease-standard",
            helpOpen
              ? "bg-accent-primary-subtle text-accent-primary"
              : "text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
          )}
        >
          <CircleHelp size={16} aria-hidden />
          {!helpOpen && changelogUnread > 0 && (
            <span
              aria-label={`${changelogUnread} unread changelog entries`}
              className="absolute right-1 top-1 size-2 rounded-full bg-accent-primary"
            />
          )}
        </button>
      </Hint>
    </>
  );

  return (
    <ModuleSwitcher
      items={MODULES.map((m) => ({
        id: m.id,
        label: m.label,
        icon: m.icon,
        href: m.href,
        shortcut: m.shortcut,
      }))}
      active={active}
      onChange={(id) => {
        const mod = MODULES.find((m) => m.id === id);
        if (mod) router.push(mod.href);
      }}
      footer={footer}
    />
  );
}

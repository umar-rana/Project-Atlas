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
} from "lucide-react";
import { ModuleSwitcher } from "@/components/layout/module-switcher";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
      <Tooltip content="Media (⌘8)" side="right">
        <Link
          href="/media"
          aria-label="Media inbox"
          className={cn(
            "relative grid size-8 place-items-center rounded-md transition-colors duration-fast ease-standard",
            active === "media"
              ? "bg-accent-primary-subtle text-accent-primary"
              : "text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
          )}
        >
          <HardDrive size={16} aria-hidden />
        </Link>
      </Tooltip>
      <Tooltip content="Trash" side="right">
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
      </Tooltip>
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

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
  Trash2,
  Activity,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTheme } from "next-themes";
import { ModuleSwitcher } from "@/components/layout/module-switcher";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const MODULES = [
  { id: "tasks", label: "Tasks", icon: CheckSquare, href: "/tasks", shortcut: ["⌘", "1"] },
  { id: "calendar", label: "Calendar", icon: Calendar, href: "/calendar", shortcut: ["⌘", "2"] },
  { id: "crm", label: "CRM", icon: Users, href: "/crm", shortcut: ["⌘", "3"] },
  { id: "notes", label: "Notes", icon: FileText, href: "/notes", shortcut: ["⌘", "4"] },
  { id: "journal", label: "Journal", icon: BookOpen, href: "/journal", shortcut: ["⌘", "5"] },
];

function getModuleId(pathname: string): string {
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/crm")) return "crm";
  if (pathname.startsWith("/notes")) return "notes";
  if (pathname.startsWith("/journal")) return "journal";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/admin")) return "health";
  if (pathname.startsWith("/usage")) return "health";
  return "tasks";
}

function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const label = `Switch to ${next} theme`;

  function handleThemeToggle() {
    setTheme(next);
    toast.success(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, { duration: 2000 });
  }

  return (
    <Tooltip content={label} side="right">
      <button
        type="button"
        aria-label={label}
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
        "3": "/crm",
        "4": "/notes",
        "5": "/journal",
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
      <Tooltip content="Settings" side="right">
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={active === "settings" ? "page" : undefined}
          className={cn(
            "relative grid size-8 place-items-center rounded-md text-text-tertiary transition-colors duration-fast ease-standard",
            "hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
            active === "settings" && "bg-accent-primary-subtle text-accent-primary",
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </Tooltip>
      <Tooltip content="Health" side="right">
        <Link
          href="/admin/health"
          aria-label="Health"
          aria-current={active === "health" ? "page" : undefined}
          className={cn(
            "relative grid size-8 place-items-center rounded-md text-text-tertiary transition-colors duration-fast ease-standard",
            "hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring",
            active === "health" && "bg-accent-primary-subtle text-accent-primary",
          )}
        >
          <Activity size={16} aria-hidden />
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
      <ThemeToggle />
    </>
  );

  return (
    <ModuleSwitcher
      items={MODULES.map((m) => ({
        id: m.id,
        label: m.label,
        icon: m.icon,
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

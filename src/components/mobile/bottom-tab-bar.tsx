"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Calendar, FileText, BookOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/m/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/m/calendar", label: "Calendar", icon: Calendar },
  { href: "/m/notes", label: "Notes", icon: FileText },
  { href: "/m/journals", label: "Journals", icon: BookOpen },
  { href: "/m/settings", label: "Settings", icon: Settings },
] as const;

export function BottomTabBar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="flex shrink-0 items-stretch border-t border-border-subtle bg-surface-base safe-area-inset-bottom"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-center",
              "min-h-[56px] transition-colors",
              active
                ? "text-accent-primary"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            <Icon size={22} aria-hidden strokeWidth={active ? 2.5 : 1.75} />
            <span className="font-ui text-[10px] font-medium leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

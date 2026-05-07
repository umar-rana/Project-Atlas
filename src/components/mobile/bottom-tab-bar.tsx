"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Inbox, FileText, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { addKeyboardListener } from "@/lib/mobile/keyboard-aware";

function CapturesBadge() {
  const { data } = trpc.capture.listInbox.useQuery({ limit: 200 }, { staleTime: 30_000 });
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-primary px-0.5 font-ui text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const TABS: { href: string; label: string; icon: React.ElementType; badge?: boolean }[] = [
  { href: "/m/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/m/captures", label: "Captures", icon: Inbox, badge: true },
  { href: "/m/notes", label: "Notes", icon: FileText },
  { href: "/m/settings", label: "Settings", icon: Settings },
];

export function BottomTabBar(): React.ReactElement {
  const pathname = usePathname();
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);

  React.useEffect(() => {
    const cleanup = addKeyboardListener((open) => setKeyboardOpen(open));
    return cleanup;
  }, []);

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "safe-area-inset-bottom flex shrink-0 items-stretch border-t border-border-subtle bg-surface-base transition-all duration-200",
        keyboardOpen && "hidden",
      )}
    >
      {TABS.map(({ href, label, icon: Icon, badge }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-center",
              "min-h-[56px] transition-colors",
              active ? "text-accent-primary" : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            <span className="relative">
              <Icon size={22} aria-hidden strokeWidth={active ? 2.5 : 1.75} />
              {badge && <CapturesBadge />}
            </span>
            <span className="font-ui text-[10px] font-medium leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

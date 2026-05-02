"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ScrollText,
  RefreshCcw,
  Briefcase,
  X,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  exact?: boolean;
}> = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/recoveries", label: "Recoveries", icon: RefreshCcw },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase },
];

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  function dismiss() {
    setBannerDismissed(true);
    router.push("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] font-sans text-white">
      {!bannerDismissed && (
        <div className="flex items-center justify-between border-b border-red-800 bg-red-950 px-4 py-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-red-300">
              Admin Panel
            </span>
            <span className="font-mono text-xs text-red-500">— system oversight only</span>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close admin panel"
            className="rounded p-1 text-red-400 transition-colors hover:bg-red-900 hover:text-red-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-1">
        <nav className="w-52 shrink-0 border-r border-white/10 bg-[#111] px-3 py-4">
          <p className="mb-4 px-2 font-mono text-2xs font-semibold uppercase tracking-widest text-white/30">
            Navigation
          </p>
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-white/50 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

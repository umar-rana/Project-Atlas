"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface NavRowProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

export function NavRow({ href, active, icon, label, badge }: NavRowProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm transition-colors",
        active
          ? "bg-accent-primary-subtle text-text-primary"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      )}
    >
      <span className="shrink-0 text-text-tertiary">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 ? <Badge variant="neutral" count={badge} /> : null}
    </Link>
  );
}

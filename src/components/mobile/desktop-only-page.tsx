"use client";

import * as React from "react";
import { Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchToDesktop } from "@/lib/mobile/switch-to-desktop";

interface DesktopOnlyPageProps {
  title: string;
  description?: string;
  variant?: "desktop-only" | "coming-soon";
  desktopHref?: string;
}

export function DesktopOnlyPage({
  title,
  description,
  variant = "desktop-only",
  desktopHref,
}: DesktopOnlyPageProps) {

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised">
          <Monitor size={32} className="text-text-tertiary" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-ui text-base font-semibold text-text-primary">
            {variant === "coming-soon" ? "Coming Soon on Mobile" : "Desktop only"}
          </p>
          <p className="font-ui text-sm leading-relaxed text-text-tertiary">
            {description ??
              (variant === "coming-soon"
                ? "This feature is not yet available on mobile."
                : "This feature is best experienced on a larger screen.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => switchToDesktop(desktopHref)}
          className={cn(
            "mt-2 flex min-h-[44px] items-center gap-2 rounded-xl px-5 font-ui text-sm font-semibold transition-colors",
            "bg-accent-primary text-white active:bg-accent-primary/90",
          )}
        >
          <Monitor size={16} aria-hidden />
          Switch to desktop site
        </button>
      </div>
    </div>
  );
}

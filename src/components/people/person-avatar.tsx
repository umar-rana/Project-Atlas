"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  displayName?: string | null;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function colorFromName(name?: string | null): string {
  if (!name) return "oklch(50% 0.09 265)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [250, 155, 75, 25, 305, 200, 350, 110];
  const hue = hues[Math.abs(hash) % hues.length]!;
  return `oklch(50% 0.14 ${hue})`;
}

const SIZE_MAP = {
  xs: "h-6 w-6 text-2xs",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

export function PersonAvatar({ displayName, photoUrl, size = "md", className }: Props) {
  const initials = getInitials(displayName);
  const bg = colorFromName(displayName);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={displayName ?? ""}
        className={cn("rounded-full object-cover flex-shrink-0", SIZE_MAP[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-ui font-semibold text-white flex-shrink-0",
        SIZE_MAP[size],
        className,
      )}
      style={{ background: bg }}
      aria-label={displayName ?? "Person"}
    >
      {initials}
    </span>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [pullDistance, setPullDistance] = React.useState(0);
  const startYRef = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const THRESHOLD = 60;

  function handleTouchStart(e: React.TouchEvent) {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startYRef.current = e.touches[0]?.clientY ?? 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    const delta = (e.touches[0]?.clientY ?? startYRef.current) - startYRef.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  }

  async function handleTouchEnd() {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(0);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
  }

  const showIndicator = pullDistance > 10 || refreshing;

  return (
    <div
      ref={containerRef}
      className={cn("h-full overflow-y-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showIndicator && (
        <div
          className="flex items-center justify-center py-3 transition-all"
          style={{ height: refreshing ? 48 : pullDistance }}
        >
          <span
            className={cn(
              "h-5 w-5 rounded-full border-2 border-accent-primary border-t-transparent",
              refreshing && "animate-spin",
            )}
            aria-hidden
          />
        </div>
      )}
      {children}
    </div>
  );
}

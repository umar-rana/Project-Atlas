"use client";

import { useEffect } from "react";

function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function useMidnightRefresh(onMidnight: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    function schedule() {
      const ms = msUntilMidnight();
      timeoutId = setTimeout(() => {
        onMidnight();
        schedule();
      }, ms);
    }

    schedule();

    return () => clearTimeout(timeoutId);
  }, [onMidnight, enabled]);
}

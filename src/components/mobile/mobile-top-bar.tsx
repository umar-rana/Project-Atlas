"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { CaptureSheet } from "./capture-sheet";
import { SearchSheet } from "./search-sheet";

function useOfflineToast() {
  React.useEffect(() => {
    let toastId: string | number | undefined;

    function handleOffline() {
      toastId = toast.error("No internet connection", { duration: Infinity }) as string | number;
    }

    function handleOnline() {
      if (toastId !== undefined) {
        toast.dismiss(toastId);
        toastId = undefined;
      }
      toast.success("Back online");
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);
}

export function MobileTopBar(): React.ReactElement {
  useOfflineToast();
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-base px-3 py-2">
        <button
          type="button"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className={cn(
            "flex min-h-[40px] flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3",
            "text-left transition-colors active:bg-surface-hover",
          )}
        >
          <Search size={15} className="shrink-0 text-text-tertiary" aria-hidden />
          <span className="font-ui text-sm text-text-tertiary">Search…</span>
        </button>

        <button
          type="button"
          aria-label="Capture"
          onClick={() => setCaptureOpen(true)}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            "bg-accent-primary text-white",
            "active:bg-accent-primary/90 transition-colors",
          )}
        >
          <Plus size={20} aria-hidden />
        </button>
      </header>

      <CaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

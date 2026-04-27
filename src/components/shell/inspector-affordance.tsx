"use client";

import * as React from "react";
import { PanelRight } from "lucide-react";
import { useShellStore } from "@/lib/shell/store";

export function InspectorAffordance(): React.ReactElement {
  const setInspectorOpen = useShellStore((s) => s.setInspectorOpen);

  return (
    <button
      type="button"
      onClick={() => setInspectorOpen(true)}
      className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
    >
      <PanelRight size={13} aria-hidden />
      Open inspector panel
    </button>
  );
}

"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PRESET_RULES, type PresetName } from "@/core/recurrence/preset-rules";

interface RecurrenceQuickPopoverProps {
  taskId: string;
  hasRule: boolean;
  onDone?: () => void;
  onOpenCustom?: () => void;
}

const QUICK_PRESETS: Array<{ value: PresetName | "none"; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "none", label: "Don't repeat" },
];

export function RecurrenceQuickPopover({
  taskId,
  hasRule,
  onDone,
  onOpenCustom,
}: RecurrenceQuickPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const setRecurrence = trpc.tasks.setRecurrence.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      setOpen(false);
      onDone?.();
    },
    onError: () => toast.error("Failed to set recurrence"),
  });

  const removeRecurrence = trpc.tasks.removeRecurrence.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      setOpen(false);
      onDone?.();
    },
    onError: () => toast.error("Failed to remove recurrence"),
  });

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handlePreset(preset: PresetName | "none") {
    if (preset === "none") {
      removeRecurrence.mutate({ id: taskId });
    } else {
      setRecurrence.mutate({
        id: taskId,
        rule: PRESET_RULES[preset],
        anchor: "due_date",
      });
    }
  }

  const isPending = setRecurrence.isPending || removeRecurrence.isPending;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={hasRule ? "Edit recurrence" : "Set recurrence"}
        aria-label={hasRule ? "Edit recurrence" : "Set recurrence"}
        className={cn(
          "shrink-0 rounded-sm p-0.5 transition-colors",
          hasRule
            ? "text-accent-info"
            : "text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-secondary",
        )}
      >
        <RefreshCw size={12} />
      </button>

      {open && (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-50 min-w-36 rounded-sm border border-border-default bg-surface-overlay py-1 font-ui text-xs text-text-primary shadow-md"
        >
          {QUICK_PRESETS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isPending}
              onClick={() => handlePreset(opt.value as PresetName | "none")}
              className="block w-full px-3 py-1 text-left hover:bg-surface-hover disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
          <div className="my-1 border-t border-border-subtle" />
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setOpen(false);
              onOpenCustom?.();
              onDone?.();
            }}
            className="block w-full px-3 py-1 text-left text-text-tertiary hover:bg-surface-hover"
          >
            Custom…
          </button>
        </div>
      )}
    </div>
  );
}

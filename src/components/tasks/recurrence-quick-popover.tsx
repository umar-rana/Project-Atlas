"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PRESET_RULES, type PresetName } from "@/core/recurrence/preset-rules";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/hint";

interface RecurrenceQuickPopoverProps {
  taskId: string;
  hasRule: boolean;
  onDone?: () => void;
  onOpenCustom?: () => void;
  showAlways?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const QUICK_PRESETS: Array<{ value: PresetName | "none"; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "none", label: "Don't repeat" },
];

const TASK_LIST_QUERY_KEY = [["tasks", "list"]];

export function RecurrenceQuickPopover({
  taskId,
  hasRule,
  onDone,
  onOpenCustom,
  showAlways = false,
  onOpenChange,
}: RecurrenceQuickPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const prevSnapshotsRef = React.useRef<Array<[readonly unknown[], unknown]>>([]);

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  function snapshotAndPatch(patch: Record<string, unknown>) {
    const snapshots = queryClient.getQueriesData<Array<Record<string, unknown>>>({
      queryKey: TASK_LIST_QUERY_KEY,
    }) as Array<[readonly unknown[], unknown]>;
    prevSnapshotsRef.current = snapshots;
    queryClient.setQueriesData<Array<Record<string, unknown>>>(
      { queryKey: TASK_LIST_QUERY_KEY },
      (old) => old?.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) ?? old,
    );
  }

  function restoreSnapshots() {
    for (const [key, data] of prevSnapshotsRef.current) {
      queryClient.setQueryData(key as unknown[], data);
    }
  }

  const setRecurrence = trpc.tasks.setRecurrence.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: TASK_LIST_QUERY_KEY });
      snapshotAndPatch({ recurrence_rule: vars.rule, recurrence_anchor: vars.anchor });
    },
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      changeOpen(false);
      onDone?.();
    },
    onError: () => {
      restoreSnapshots();
      toast.error("Failed to set recurrence");
    },
  });

  const removeRecurrence = trpc.tasks.removeRecurrence.useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TASK_LIST_QUERY_KEY });
      snapshotAndPatch({ recurrence_rule: null, recurrence_anchor: null });
    },
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      changeOpen(false);
      onDone?.();
    },
    onError: () => {
      restoreSnapshots();
      toast.error("Failed to remove recurrence");
    },
  });

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
    <Popover open={open} onOpenChange={changeOpen}>
      <Hint label={hasRule ? "Edit recurrence" : "Set recurrence"}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={hasRule ? "Edit recurrence" : "Set recurrence"}
            className={cn(
              "shrink-0 rounded-sm p-0.5 transition-colors",
              hasRule
                ? "text-accent-info"
                : showAlways
                  ? "text-text-tertiary hover:text-text-secondary"
                  : "text-text-tertiary opacity-0 hover:text-text-secondary group-hover:opacity-100",
            )}
          >
            <RefreshCw size={12} />
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-36 p-1" onClick={(e) => e.stopPropagation()}>
        {QUICK_PRESETS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={isPending}
            onClick={() => handlePreset(opt.value as PresetName | "none")}
            className="block w-full rounded-sm px-2 py-1 text-left text-sm text-text-primary hover:bg-accent-primary-subtle disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
        <div className="-mx-1 my-1 h-px bg-border-subtle" />
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            changeOpen(false);
            onOpenCustom?.();
            onDone?.();
          }}
          className="block w-full rounded-sm px-2 py-1 text-left text-sm text-text-tertiary hover:bg-accent-primary-subtle"
        >
          Custom…
        </button>
      </PopoverContent>
    </Popover>
  );
}

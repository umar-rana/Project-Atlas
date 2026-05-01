"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import {
  PRESET_RULES,
  PRESET_LABELS,
  ruleToPreset,
  type PresetName,
} from "@/core/recurrence/preset-rules";
import { buildRRule, describeRule, parseRuleToFormState } from "@/core/recurrence/rrule-helpers";
import { useLocale } from "@/core/locale/hooks";

interface RecurrenceFormProps {
  taskId: string;
  recurrenceRule: string | null | undefined;
  recurrenceAnchor: string | null | undefined;
  hasSubtasks: boolean;
  disabled?: boolean;
  onChanged?: () => void;
}

const PRESET_OPTIONS: Array<{ value: PresetName | "none" | "custom"; label: string }> = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekday", label: "Every weekday" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom…" },
];

const WEEKDAYS = [
  { key: "MO", label: "Mon" },
  { key: "TU", label: "Tue" },
  { key: "WE", label: "Wed" },
  { key: "TH", label: "Thu" },
  { key: "FR", label: "Fri" },
  { key: "SA", label: "Sat" },
  { key: "SU", label: "Sun" },
];

export function RecurrenceForm({
  taskId,
  recurrenceRule,
  recurrenceAnchor,
  hasSubtasks,
  disabled,
  onChanged,
}: RecurrenceFormProps) {
  const locale = useLocale();
  const utils = trpc.useUtils();

  const setRecurrence = trpc.tasks.setRecurrence.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.list.invalidate();
      onChanged?.();
    },
    onError: () => toast.error("Failed to save recurrence"),
  });

  const removeRecurrence = trpc.tasks.removeRecurrence.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.list.invalidate();
      onChanged?.();
    },
    onError: () => toast.error("Failed to remove recurrence"),
  });

  const currentPreset = ruleToPreset(recurrenceRule);
  const currentAnchor = (recurrenceAnchor ?? "due_date") as "due_date" | "completion_date";

  const [localPreset, setLocalPreset] = React.useState<PresetName | "none" | "custom">(
    currentPreset,
  );
  const [localAnchor, setLocalAnchor] = React.useState<"due_date" | "completion_date">(
    currentAnchor,
  );
  const [customFreq, setCustomFreq] = React.useState<"daily" | "weekly" | "monthly" | "yearly">(
    "weekly",
  );
  const [customInterval, setCustomInterval] = React.useState(1);
  const [customDays, setCustomDays] = React.useState<string[]>([]);
  const [endMode, setEndMode] = React.useState<"never" | "count" | "date">("never");
  const [endCount, setEndCount] = React.useState(5);
  const [endDate, setEndDate] = React.useState("");

  React.useEffect(() => {
    const preset = ruleToPreset(recurrenceRule);
    setLocalPreset(preset);
    setLocalAnchor((recurrenceAnchor ?? "due_date") as "due_date" | "completion_date");
    // Hydrate custom form state so existing custom rules aren't clobbered
    if (preset === "custom" && recurrenceRule) {
      const parsed = parseRuleToFormState(recurrenceRule);
      setCustomFreq(parsed.freq);
      setCustomInterval(parsed.interval);
      setCustomDays(parsed.days);
      setEndMode(parsed.endMode);
      setEndCount(parsed.endCount);
      setEndDate(parsed.endDate);
    }
  }, [recurrenceRule, recurrenceAnchor]);

  function buildCurrentRule(): string {
    if (localPreset !== "custom") {
      return PRESET_RULES[localPreset as PresetName] ?? "";
    }
    return buildRRule({
      freq: customFreq,
      interval: customInterval > 1 ? customInterval : undefined,
      byweekday: customFreq === "weekly" && customDays.length > 0 ? customDays : undefined,
      count: endMode === "count" ? endCount : null,
      until: endMode === "date" && endDate ? new Date(endDate) : null,
    });
  }

  function applyPreset(preset: PresetName | "none" | "custom") {
    setLocalPreset(preset);
    if (preset === "none") {
      removeRecurrence.mutate({ id: taskId });
    } else if (preset !== "custom") {
      const rule = PRESET_RULES[preset as PresetName];
      setRecurrence.mutate({ id: taskId, rule, anchor: localAnchor });
    }
  }

  function applyCustom() {
    const rule = buildCurrentRule();
    if (!rule) return;
    setRecurrence.mutate({ id: taskId, rule, anchor: localAnchor });
  }

  function applyAnchorChange(anchor: "due_date" | "completion_date") {
    setLocalAnchor(anchor);
    if (localPreset !== "none" && localPreset !== "custom") {
      const rule = PRESET_RULES[localPreset as PresetName];
      setRecurrence.mutate({ id: taskId, rule, anchor });
    } else if (localPreset === "custom") {
      // Use the existing stored rule directly to avoid clobbering it
      // with potentially uninitialized form state defaults.
      if (recurrenceRule) setRecurrence.mutate({ id: taskId, rule: recurrenceRule, anchor });
    }
  }

  const summary =
    recurrenceRule
      ? describeRule(recurrenceRule, currentAnchor, locale)
      : null;

  const isPending = setRecurrence.isPending || removeRecurrence.isPending;

  return (
    <section className="mt-4">
      <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
        Repeat
      </h3>

      {hasSubtasks && (
        <div className="mb-2 flex items-start gap-1.5 rounded-sm border border-accent-warning/30 bg-accent-warning/5 px-2 py-1.5">
          <AlertCircle size={11} className="mt-0.5 shrink-0 text-accent-warning" />
          <p className="font-ui text-2xs text-text-secondary">
            Subtasks don&apos;t yet repeat with recurrence
          </p>
        </div>
      )}

      <select
        value={localPreset}
        onChange={(e) => applyPreset(e.target.value as PresetName | "none" | "custom")}
        disabled={disabled || isPending}
        className="w-full rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus disabled:opacity-50"
      >
        {PRESET_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {localPreset === "custom" && (
        <div className="mt-2 space-y-2 rounded-sm border border-border-subtle bg-surface-raised p-2">
          <div className="flex items-center gap-2">
            <span className="font-ui text-2xs text-text-tertiary">Every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={customInterval}
              onChange={(e) => setCustomInterval(Math.max(1, Number(e.target.value)))}
              disabled={disabled}
              className="w-14 rounded-sm border border-border-default bg-surface-base px-1.5 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
            />
            <select
              value={customFreq}
              onChange={(e) => {
                setCustomFreq(e.target.value as typeof customFreq);
                setCustomDays([]);
              }}
              disabled={disabled}
              className="flex-1 rounded-sm border border-border-default bg-surface-base px-1.5 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
            >
              <option value="daily">day(s)</option>
              <option value="weekly">week(s)</option>
              <option value="monthly">month(s)</option>
              <option value="yearly">year(s)</option>
            </select>
          </div>

          {customFreq === "weekly" && (
            <div>
              <span className="mb-1 block font-ui text-2xs text-text-tertiary">On days</span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => {
                  const on = customDays.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        setCustomDays((prev) =>
                          on ? prev.filter((k) => k !== d.key) : [...prev, d.key],
                        )
                      }
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 font-ui text-2xs",
                        on
                          ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                          : "border-border-subtle text-text-tertiary hover:border-border-default",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <span className="mb-1 block font-ui text-2xs text-text-tertiary">Ends</span>
            <div className="flex gap-2">
              {(["never", "count", "date"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEndMode(mode)}
                  className={cn(
                    "rounded-sm border px-2 py-0.5 font-ui text-2xs",
                    endMode === mode
                      ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                      : "border-border-subtle text-text-tertiary hover:border-border-default",
                  )}
                >
                  {mode === "never" ? "Never" : mode === "count" ? "After" : "On date"}
                </button>
              ))}
            </div>
            {endMode === "count" && (
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={endCount}
                  onChange={(e) => setEndCount(Math.max(1, Number(e.target.value)))}
                  disabled={disabled}
                  className="w-16 rounded-sm border border-border-default bg-surface-base px-1.5 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
                />
                <span className="font-ui text-2xs text-text-tertiary">occurrences</span>
              </div>
            )}
            {endMode === "date" && (
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={disabled}
                className="mt-1 rounded-sm border border-border-default bg-surface-base px-1.5 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            )}
          </div>

          <button
            type="button"
            onClick={applyCustom}
            disabled={disabled || isPending}
            className="rounded-sm bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {localPreset !== "none" && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-ui text-2xs text-text-tertiary">Anchor</span>
            <select
              value={localAnchor}
              onChange={(e) => applyAnchorChange(e.target.value as typeof localAnchor)}
              disabled={disabled || isPending}
              className="flex-1 rounded-sm border border-border-default bg-surface-base px-1.5 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus disabled:opacity-50"
            >
              <option value="due_date">From due date</option>
              <option value="completion_date">From completion date</option>
            </select>
          </div>

          {summary && (
            <p className="font-ui text-2xs text-text-tertiary">{summary}</p>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-accent-primary" : "bg-border-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function CaptureParsingSection({ userData }: { userData: User | undefined }) {
  const utils = trpc.useUtils();
  const updatePrefs = trpc.capture.updateCapturePrefs.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  const capturePrefs =
    ((typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
      ? (userData.tasks_prefs as Record<string, unknown>).capture_prefs
      : {}) as Record<string, unknown> | undefined) ?? {};

  const aiCaptureEnabled = (capturePrefs.ai_capture_enabled as boolean | undefined) ?? true;
  const parseReviewModal = (capturePrefs.parse_review_modal as string | undefined) ?? "never";
  const autoCreateTags = (capturePrefs.auto_create_tags as boolean | undefined) ?? true;
  const autoLinkProjects = (capturePrefs.auto_link_projects as boolean | undefined) ?? true;
  const autoLinkPeople = (capturePrefs.auto_link_people as boolean | undefined) ?? false;
  const aiFallbackEnabled = (capturePrefs.ai_fallback_enabled as boolean | undefined) ?? true;

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
      <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Capture parsing</h3>
      <p className="mb-4 font-ui text-xs text-text-secondary">
        Configure how Atlas parses and files tasks when you capture them.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              Enable AI capture parsing
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Master toggle — disable to use local-only parsing for all captures.
            </p>
          </div>
          <ToggleSwitch
            checked={aiCaptureEnabled}
            onChange={(v) => updatePrefs.mutate({ ai_capture_enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              AI fallback for hard cases
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Use AI when local confidence is below threshold.
            </p>
          </div>
          <ToggleSwitch
            checked={aiFallbackEnabled}
            onChange={(v) => updatePrefs.mutate({ ai_fallback_enabled: v })}
          />
        </div>

        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-primary">
            Show parse review modal
          </label>
          <p className="mb-1.5 font-ui text-2xs text-text-tertiary">
            Appear before saving so you can inspect and adjust what was parsed.
          </p>
          <select
            value={parseReviewModal}
            onChange={(e) =>
              updatePrefs.mutate({
                parse_review_modal: e.target.value as "never" | "when_uncertain" | "always",
              })
            }
            className="rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            <option value="never">Never</option>
            <option value="when_uncertain">When uncertain (confidence &lt; threshold)</option>
            <option value="always">Always</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">Allow auto-create tags</p>
            <p className="font-ui text-2xs text-text-tertiary">
              Automatically create new tags from capture hints.
            </p>
          </div>
          <ToggleSwitch
            checked={autoCreateTags}
            onChange={(v) => updatePrefs.mutate({ auto_create_tags: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              Allow auto-link to projects
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Automatically link tasks to existing projects by name.
            </p>
          </div>
          <ToggleSwitch
            checked={autoLinkProjects}
            onChange={(v) => updatePrefs.mutate({ auto_link_projects: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              Allow auto-link to people
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Automatically link @mentions to Atlas People entries.
            </p>
          </div>
          <ToggleSwitch
            checked={autoLinkPeople}
            onChange={(v) => updatePrefs.mutate({ auto_link_people: v })}
          />
        </div>
      </div>
    </div>
  );
}

function CaptureIntelligenceSection({ userData }: { userData: User | undefined }) {
  const utils = trpc.useUtils();
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [sliderValue, setSliderValue] = useState<number>(userData?.ai_confidence_threshold ?? 0.7);
  const [sliderApplied, setSliderApplied] = useState(false);

  const strategyStats = trpc.capture.strategyStats.useQuery({ days: rangeDays });
  const qualityStats = trpc.capture.qualityStats.useQuery({ days: rangeDays });
  const overrideStats = trpc.capture.overrideStats.useQuery({ days: rangeDays });
  const thresholdImpact = trpc.capture.thresholdImpact.useQuery(
    { threshold: sliderValue, days: rangeDays },
    { staleTime: 1000 },
  );
  const exportStats = trpc.capture.exportStats.useQuery({ days: rangeDays }, { enabled: false });
  const updateThreshold = trpc.capture.updateThreshold.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setSliderApplied(true);
      setTimeout(() => setSliderApplied(false), 2000);
    },
  });
  const updateFallback = trpc.capture.updateCapturePrefs.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  const capturePrefs =
    ((typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
      ? (userData.tasks_prefs as Record<string, unknown>).capture_prefs
      : {}) as Record<string, unknown> | undefined) ?? {};
  const aiFallbackEnabled = (capturePrefs.ai_fallback_enabled as boolean | undefined) ?? true;

  const st = strategyStats.data;
  const qt = qualityStats.data;
  const ov = overrideStats.data;
  const ti = thresholdImpact.data;

  const strategyVerdict = (() => {
    if (!st || st.totalCaptures === 0) return null;
    const localPct = (st.byTier.local_only / st.totalCaptures) * 100;
    if (localPct >= 70)
      return { label: "Working well", color: "text-accent-success", bg: "bg-accent-success/10" };
    if (localPct >= 40)
      return { label: "Marginal", color: "text-accent-warning", bg: "bg-accent-warning/10" };
    return { label: "Underperforming", color: "text-accent-danger", bg: "bg-accent-danger/10" };
  })();

  function handleExport() {
    exportStats.refetch().then((res) => {
      if (!res.data) return;
      const blob = new Blob([res.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capture-stats-${rangeDays}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const RANGE_OPTIONS = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
    { label: "All", value: 0 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-ui text-base font-semibold text-text-primary">Capture intelligence</h3>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRangeDays(opt.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-ui text-xs font-medium transition-colors",
                rangeDays === opt.value
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-tertiary hover:text-text-secondary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-ui text-sm font-semibold text-text-primary">Strategy performance</h4>
          {strategyVerdict && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 font-ui text-2xs font-medium",
                strategyVerdict.bg,
                strategyVerdict.color,
              )}
            >
              {strategyVerdict.label}
            </span>
          )}
        </div>
        {strategyStats.isLoading ? (
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        ) : !st || st.totalCaptures === 0 ? (
          <p className="font-ui text-xs text-text-tertiary">No capture data for this period.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 font-ui text-2xs text-text-tertiary">
                Parse tier distribution ({st.totalCaptures} total)
              </p>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-sunken">
                {st.byTier.local_only > 0 && (
                  <div
                    title={`Local only: ${st.byTier.local_only}`}
                    style={{ width: `${(st.byTier.local_only / st.totalCaptures) * 100}%` }}
                    className="h-full bg-accent-success transition-all"
                  />
                )}
                {st.byTier.local_plus_ai > 0 && (
                  <div
                    title={`Local + AI: ${st.byTier.local_plus_ai}`}
                    style={{ width: `${(st.byTier.local_plus_ai / st.totalCaptures) * 100}%` }}
                    className="h-full bg-accent-info transition-all"
                  />
                )}
                {st.byTier.fallback_only > 0 && (
                  <div
                    title={`AI primary: ${st.byTier.fallback_only}`}
                    style={{ width: `${(st.byTier.fallback_only / st.totalCaptures) * 100}%` }}
                    className="h-full bg-accent-warning transition-all"
                  />
                )}
              </div>
              <div className="mt-1 flex gap-3 font-ui text-2xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-success" />
                  Local only ({st.byTier.local_only})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-info" />
                  Local+AI ({st.byTier.local_plus_ai})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-warning" />
                  AI primary ({st.byTier.fallback_only})
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Actual AI cost</p>
                <p className="font-ui text-sm font-semibold text-text-primary">
                  ${st.totalAiCost.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Estimated pure-AI</p>
                <p className="font-ui text-sm font-semibold text-text-primary">
                  ${st.estimatedPureAiCost.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Savings</p>
                <p className="font-ui text-sm font-semibold text-accent-success">
                  ${st.aiCostSavings.toFixed(4)}
                  {st.estimatedPureAiCost > 0 && (
                    <span className="ml-1 font-ui text-2xs font-normal text-text-tertiary">
                      ({((st.aiCostSavings / st.estimatedPureAiCost) * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h4 className="mb-3 font-ui text-sm font-semibold text-text-primary">Parse quality</h4>
        {qualityStats.isLoading ? (
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        ) : !qt || qt.total === 0 ? (
          <p className="font-ui text-xs text-text-tertiary">No capture data for this period.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Avg confidence</p>
                <p className="font-ui text-sm font-semibold text-text-primary">
                  {(qt.avgConfidence * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">AI error rate</p>
                <p
                  className={cn(
                    "font-ui text-sm font-semibold",
                    qt.aiFailureRate > 0.1 ? "text-accent-danger" : "text-text-primary",
                  )}
                >
                  {(qt.aiFailureRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            {(qt.avgLocalMs !== undefined || qt.avgAiMs !== undefined) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                  <p className="font-ui text-2xs text-text-tertiary">Local parse latency</p>
                  <p className="font-ui text-sm font-semibold text-text-primary">
                    {qt.avgLocalMs ?? 0}ms
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                  <p className="font-ui text-2xs text-text-tertiary">AI parse latency</p>
                  <p className="font-ui text-sm font-semibold text-text-primary">
                    {qt.avgAiMs ?? 0}ms
                  </p>
                </div>
              </div>
            )}
            {ov && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                    <p className="font-ui text-2xs text-text-tertiary">
                      Suggestion acceptance rate
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className={cn(
                          "font-ui text-sm font-semibold",
                          ov.overrideRate > 0.3 ? "text-accent-warning" : "text-accent-success",
                        )}
                      >
                        {ov.totalCaptures > 0
                          ? `${(100 - ov.overrideRate * 100).toFixed(0)}%`
                          : "—"}
                      </p>
                      {ov.previousOverrideRate !== null &&
                        ov.previousOverrideRate !== undefined && (
                          <span
                            className={cn(
                              "font-ui text-2xs font-medium",
                              ov.overrideRate > ov.previousOverrideRate
                                ? "text-accent-danger"
                                : ov.overrideRate < ov.previousOverrideRate
                                  ? "text-accent-success"
                                  : "text-text-tertiary",
                            )}
                          >
                            {ov.overrideRate > ov.previousOverrideRate
                              ? "↑ more overrides"
                              : ov.overrideRate < ov.previousOverrideRate
                                ? "↓ fewer overrides"
                                : "→ stable"}
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                    <p className="font-ui text-2xs text-text-tertiary">Most overridden field</p>
                    <p className="font-ui text-sm font-semibold capitalize text-text-primary">
                      {ov.mostOverridden
                        ? `${ov.mostOverridden} (${ov.mostOverriddenCount}×)`
                        : "—"}
                    </p>
                  </div>
                </div>
                {ov.leastOverridden && ov.leastOverridden !== ov.mostOverridden && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                      <p className="font-ui text-2xs text-text-tertiary">Least overridden field</p>
                      <p className="font-ui text-sm font-semibold capitalize text-accent-success">
                        {`${ov.leastOverridden} (${ov.leastOverriddenCount}×)`}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={exportStats.isFetching}
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                {exportStats.isFetching ? "Exporting…" : "Download capture stats as CSV"}
              </button>
              <a
                href="/capture/logs?filter=overrides"
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                View overrides log →
              </a>
              <a
                href="/capture/saved"
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                Edit saved captures →
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h4 className="mb-3 font-ui text-sm font-semibold text-text-primary">Adjustments</h4>
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="font-ui text-xs font-medium text-text-primary">
                Confidence threshold
              </label>
              <span className="font-ui text-xs font-semibold text-text-primary">
                {sliderValue.toFixed(2)}
              </span>
            </div>
            <p className="mb-2 font-ui text-2xs text-text-tertiary">
              Captures below this confidence use AI. Higher = more AI calls.
            </p>
            <input
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full accent-accent-primary"
            />
            <div className="mt-1 flex justify-between font-ui text-2xs text-text-tertiary">
              <span>0.50 (less AI)</span>
              <span>0.90 (more AI)</span>
            </div>
            {ti && ti.total > 0 && (
              <div className="mt-2 rounded-md border border-border-subtle bg-surface-base px-3 py-2">
                <p className="font-ui text-2xs text-text-secondary">
                  At this threshold, based on last {rangeDays}d:{" "}
                  <span className="font-semibold">{ti.wouldSkipAi} captures</span> go local-only,{" "}
                  <span className="font-semibold">{ti.wouldUseAi} uses AI</span>, estimated cost{" "}
                  <span className="font-semibold">${ti.estimatedDailyCost.toFixed(4)}</span>.
                </p>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateThreshold.mutate({ threshold: sliderValue })}
                disabled={updateThreshold.isPending}
                className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
              >
                {updateThreshold.isPending ? "Saving…" : "Apply changes"}
              </button>
              {sliderApplied && <span className="font-ui text-xs text-accent-success">Saved</span>}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border-subtle pt-4">
            <div>
              <p className="font-ui text-xs font-medium text-text-primary">AI fallback</p>
              <p className="font-ui text-2xs text-text-tertiary">
                Disable to use local-only parsing for all captures.
              </p>
            </div>
            <ToggleSwitch
              checked={aiFallbackEnabled}
              onChange={(v) => updateFallback.mutate({ ai_fallback_enabled: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AISection({ userData }: { userData?: User }) {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.ai.usageStats.useQuery();
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const user = (rawUserData as User | undefined) ?? userData;

  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("atlas:ai_enabled");
    return stored !== "false";
  });

  const [budgetInput, setBudgetInput] = useState<string>(() => {
    const v = (userData as (User & { ai_budget_usd?: number | null }) | undefined)?.ai_budget_usd;
    return v != null ? String(v) : "";
  });
  const [budgetSaved, setBudgetSaved] = useState(false);

  useEffect(() => {
    const v = (user as (User & { ai_budget_usd?: number | null }) | undefined)?.ai_budget_usd;
    setBudgetInput(v != null ? String(v) : "");
  }, [user]);

  const updateBudgetMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      utils.ai.usageStats.invalidate();
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    },
  });

  function handleBudgetSave() {
    const parsed = budgetInput.trim() === "" ? null : parseFloat(budgetInput);
    if (parsed !== null && (isNaN(parsed) || parsed <= 0)) return;
    updateBudgetMutation.mutate({ ai_budget_usd: parsed });
  }

  function handleToggle() {
    const next = !aiEnabled;
    setAiEnabled(next);
    localStorage.setItem("atlas:ai_enabled", String(next));
  }

  const monthlyUsd = stats?.monthly.costUsd ?? 0;
  const budgetUsd = stats?.budgetUsd ?? null;
  const budgetPct = budgetUsd != null && budgetUsd > 0 ? monthlyUsd / budgetUsd : null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="AI" description="Configure how Atlas uses AI features." />

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-ui text-sm font-semibold text-text-primary">AI Features</h3>
            <p className="font-ui text-xs text-text-tertiary">
              Enable or disable all AI-powered features in Atlas.
            </p>
          </div>
          <ToggleSwitch checked={aiEnabled} onChange={handleToggle} />
        </div>
        <p className="mt-2 font-ui text-2xs text-text-tertiary">
          Preference saved locally — full profile sync coming in a future wave.
        </p>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Monthly AI Budget</h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          Set a monthly spending limit. You will see a warning on the usage page when you reach 80%
          of your budget.
        </p>
        <div className="flex items-center gap-2">
          <span className="font-ui text-sm text-text-secondary">$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="No limit"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBudgetSave()}
            className="w-32 rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
          <button
            type="button"
            onClick={handleBudgetSave}
            disabled={updateBudgetMutation.isPending}
            className="rounded-md bg-accent-primary px-3 py-2 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {updateBudgetMutation.isPending ? "Saving…" : "Save"}
          </button>
          {budgetInput !== "" && (
            <button
              type="button"
              onClick={() => {
                setBudgetInput("");
                updateBudgetMutation.mutate({ ai_budget_usd: null });
              }}
              className="font-ui text-xs text-text-tertiary hover:text-text-secondary"
            >
              Clear
            </button>
          )}
          {budgetSaved && <span className="font-ui text-xs text-accent-success">Saved</span>}
        </div>
        {budgetUsd != null && budgetPct != null && budgetPct >= 0.8 && (
          <div
            className={cn(
              "mt-3 rounded-lg px-3 py-2 font-ui text-xs font-medium",
              budgetPct >= 1
                ? "bg-accent-danger-muted text-accent-danger"
                : "bg-accent-warning-muted text-accent-warning",
            )}
          >
            {budgetPct >= 1
              ? `Budget exceeded — $${monthlyUsd.toFixed(4)} spent of $${budgetUsd.toFixed(2)} limit.`
              : `Heads up — you've used ${(budgetPct * 100).toFixed(0)}% of your $${budgetUsd.toFixed(2)} monthly budget.`}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Usage & Cost</h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          Estimated cost this month based on AI calls logged.
        </p>
        <div className="mb-4 flex items-baseline gap-1">
          {isLoading ? (
            <span className="font-ui text-xl font-semibold text-text-primary">—</span>
          ) : (
            <>
              <span className="font-ui text-xl font-semibold text-text-primary">
                ${monthlyUsd.toFixed(4)}
              </span>
              <span className="font-ui text-xs text-text-tertiary">this month</span>
            </>
          )}
        </div>
        {stats && (
          <p className="mb-3 font-ui text-2xs text-text-tertiary">
            {stats.monthly.calls} call{stats.monthly.calls !== 1 ? "s" : ""} ·{" "}
            {((stats.monthly.inputTokens + stats.monthly.outputTokens) / 1000).toFixed(1)}k tokens
          </p>
        )}
        <a
          href="/usage"
          className="inline-flex rounded-md border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
        >
          View full usage →
        </a>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-base p-5">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Model</h3>
        <p className="font-ui text-xs text-text-secondary">
          Atlas uses Claude (Anthropic) for all AI features. Model selection and per-feature toggles
          coming in a future wave.
        </p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-base p-5">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">System Health</h3>
        <p className="mb-2 font-ui text-xs text-text-secondary">
          Check AI connectivity and latency.
        </p>
        <a
          href="/admin/health"
          className="inline-flex rounded-md border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
        >
          View Health Dashboard →
        </a>
      </div>

      <div className="border-t border-border-subtle pt-2">
        <CaptureParsingSection userData={user} />
      </div>

      <div className="border-t border-border-subtle pt-2">
        <CaptureIntelligenceSection userData={user} />
      </div>
    </div>
  );
}

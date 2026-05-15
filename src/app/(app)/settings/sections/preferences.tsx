"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import {
  LOCALE_PRESETS,
  DATE_FORMAT_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  ISO_4217_CURRENCY_CODES,
  LANGUAGE_OPTIONS,
} from "@/core/locale/presets";
import type { LocalePresetKey } from "@/core/locale/presets";
import {
  formatDate,
  formatTime,
  formatNumber,
  formatCurrency,
  formatWeekdayAbbrev,
  formatMonthAbbrev,
} from "@/core/locale/formatters";
import type { LocaleSettings } from "@/core/locale/formatters";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

function LocalePreviewBlock({ locale }: { locale: LocaleSettings }) {
  const sampleDate = new Date(2025, 11, 31, 14, 5, 0);
  const sampleNumber = 1234567.89;
  const sampleCurrency = 9999.5;

  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2025, 11, 28 + i));
  const months = [new Date(2025, 10, 1), new Date(2025, 11, 1), new Date(2026, 0, 1)];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-4">
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Date</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatDate(sampleDate, locale)}
        </p>
      </div>
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Time</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatTime(sampleDate, locale)}
        </p>
      </div>
      <div className="col-span-2">
        <p className="font-ui text-2xs font-medium text-text-tertiary">Weekdays</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {weekdays.map((d, i) => (
            <span key={i} className="font-mono text-sm text-text-primary">
              {formatWeekdayAbbrev(d, locale.language)}
            </span>
          ))}
        </div>
      </div>
      <div className="col-span-2">
        <p className="font-ui text-2xs font-medium text-text-tertiary">Months</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {months.map((d, i) => (
            <span key={i} className="font-mono text-sm text-text-primary">
              {formatMonthAbbrev(d, locale.language)}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Number</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatNumber(sampleNumber, locale)}
        </p>
      </div>
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Currency</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatCurrency(sampleCurrency, locale)}
        </p>
      </div>
    </div>
  );
}

export function PreferencesSection({ initialUser }: { initialUser: User }) {
  const utils = trpc.useUtils();
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const user = (rawUserData as User | undefined) ?? initialUser;

  const serverPreset = (user.locale_preset ?? "pakistan") as LocalePresetKey;

  const [localPreset, setLocalPreset] = useState<LocalePresetKey>(serverPreset);
  const [localLocale, setLocalLocale] = useState<LocaleSettings>({
    date_format: user.date_format ?? "DD/MM/YYYY",
    time_format: (user.time_format as "12h" | "24h") ?? "12h",
    number_format: user.number_format ?? "1,234.56",
    currency_code: user.currency_code ?? "PKR",
    currency_symbol: user.currency_symbol ?? "₨",
    language: user.language ?? "ur",
  });
  // CR §3.4.5 — Default time for date-only items. Lives alongside the
  // locale fields but is a separate state because LocaleSettings doesn't
  // carry it (it's not strictly a locale; it's a task-domain default).
  const [localDefaultEventTime, setLocalDefaultEventTime] = useState<string>(
    (user as { default_event_time?: string }).default_event_time ?? "09:00",
  );

  const [showCustom, setShowCustom] = useState(serverPreset === "custom");
  const [saved, setSaved] = useState<string | null>(null);
  const [localeError, setLocaleError] = useState<string | null>(null);

  useEffect(() => {
    setLocalPreset(serverPreset);
    setLocalLocale({
      date_format: user.date_format ?? "DD/MM/YYYY",
      time_format: (user.time_format as "12h" | "24h") ?? "12h",
      number_format: user.number_format ?? "1,234.56",
      currency_code: user.currency_code ?? "PKR",
      currency_symbol: user.currency_symbol ?? "₨",
      language: user.language ?? "ur",
    });
    setLocalDefaultEventTime(
      (user as { default_event_time?: string }).default_event_time ?? "09:00",
    );
    setShowCustom(serverPreset === "custom");
  }, [
    serverPreset,
    user.date_format,
    user.time_format,
    user.number_format,
    user.currency_code,
    user.currency_symbol,
    user.language,
    (user as { default_event_time?: string }).default_event_time,
    user,
  ]);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- TS2589: tRPC type inference depth; safe at runtime
  const updateLocale = trpc.user.updateLocale.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setLocaleError(null);
      setSaved("Saved");
      setTimeout(() => setSaved(null), 2000);
    },
    onError: (err) => {
      setLocaleError(err.message ?? "Failed to save locale settings.");
    },
  });

  function handlePresetChange(preset: LocalePresetKey) {
    setLocalPreset(preset);
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    const p = LOCALE_PRESETS.find((lp) => lp.key === preset);
    if (!p) return;
    setLocalLocale(p.settings);
    setShowCustom(false);
    updateLocale.mutate({
      preset: preset as "pakistan" | "us" | "uk",
      language: p.settings.language,
    });
  }

  function handleLanguageChange(language: string) {
    setLocalLocale((prev) => ({ ...prev, language }));
    if (localPreset !== "custom") {
      updateLocale.mutate({ preset: localPreset as "pakistan" | "us" | "uk", language });
    }
  }

  function handleCustomSave() {
    const code = localLocale.currency_code.trim().toUpperCase();
    if (!ISO_4217_CURRENCY_CODES.has(code)) {
      setLocaleError("Currency code must be a valid ISO 4217 code (e.g. USD, EUR, PKR).");
      return;
    }
    const symbol = localLocale.currency_symbol.trim();
    if (!symbol) {
      setLocaleError("Currency symbol cannot be empty.");
      return;
    }
    if (symbol.length > 5) {
      setLocaleError("Currency symbol must be 5 characters or fewer.");
      return;
    }
    // CR §3.4.5 — validate the default event time before submit. The
    // server also validates, but a friendly client-side check produces
    // a better error message.
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localDefaultEventTime)) {
      setLocaleError("Default time for date-only items must be HH:MM (24h, e.g. 09:00).");
      return;
    }
    setLocaleError(null);
    updateLocale.mutate({
      preset: "custom",
      date_format: localLocale.date_format,
      time_format: localLocale.time_format as "12h" | "24h",
      default_event_time: localDefaultEventTime,
      number_format: localLocale.number_format,
      currency_code: code,
      currency_symbol: symbol,
      language: localLocale.language,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Preferences"
        description="Control how dates, numbers, and currencies are displayed throughout Atlas."
      />

      {saved && (
        <div className="rounded-lg bg-accent-success-muted px-4 py-2 font-ui text-sm text-accent-success">
          {saved}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
            Locale preset
          </label>
          <select
            className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            value={localPreset}
            onChange={(e) => handlePresetChange(e.target.value as LocalePresetKey)}
          >
            {LOCALE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Choose a preset to apply locale defaults, or select Custom to configure each setting
            individually.
          </p>
        </div>

        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
            Language
          </label>
          <select
            className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            value={localLocale.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Controls weekday and month names throughout Atlas.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 font-ui text-xs font-medium text-text-secondary">Live preview</p>
        <LocalePreviewBlock locale={localLocale} />
      </div>

      {(showCustom || localPreset === "custom") && (
        <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
          <h3 className="mb-4 font-ui text-sm font-semibold text-text-primary">
            Custom locale settings
          </h3>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Date format
                </label>
                <select
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  value={localLocale.date_format}
                  onChange={(e) => setLocalLocale((l) => ({ ...l, date_format: e.target.value }))}
                >
                  {DATE_FORMAT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Time format
                </label>
                <div className="flex gap-2">
                  {TIME_FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setLocalLocale((l) => ({ ...l, time_format: opt.value as "12h" | "24h" }))
                      }
                      className={cn(
                        "flex-1 rounded-md border px-3 py-2 font-ui text-sm font-medium transition-colors",
                        localLocale.time_format === opt.value
                          ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                          : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover",
                      )}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  htmlFor="default-event-time"
                  className="mb-1 block font-ui text-xs font-medium text-text-secondary"
                >
                  Default time for date-only items
                </label>
                <input
                  id="default-event-time"
                  type="time"
                  value={localDefaultEventTime}
                  onChange={(e) => setLocalDefaultEventTime(e.target.value)}
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                />
                <p className="mt-1 font-ui text-2xs text-text-tertiary">
                  When you add a task with only a date (no specific time), this time will be used if
                  you later enable &ldquo;Include time&rdquo; on that task.
                </p>
              </div>
            </div>
            <div>
              <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                Number format
              </label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                value={localLocale.number_format}
                onChange={(e) => setLocalLocale((l) => ({ ...l, number_format: e.target.value }))}
              >
                {NUMBER_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Currency code
                </label>
                <input
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  value={localLocale.currency_code}
                  maxLength={3}
                  onChange={(e) =>
                    setLocalLocale((l) => ({ ...l, currency_code: e.target.value.toUpperCase() }))
                  }
                  placeholder="PKR"
                />
                <p className="mt-1 font-ui text-2xs text-text-tertiary">
                  Valid ISO 4217 code (e.g. USD, EUR, PKR)
                </p>
              </div>
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Currency symbol
                </label>
                <input
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  value={localLocale.currency_symbol}
                  maxLength={5}
                  onChange={(e) =>
                    setLocalLocale((l) => ({ ...l, currency_symbol: e.target.value }))
                  }
                  placeholder="₨"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 font-ui text-xs font-medium text-text-secondary">
                Preview with custom settings
              </p>
              <LocalePreviewBlock locale={localLocale} />
            </div>
            {localeError && (
              <p className="rounded-md bg-accent-danger-muted px-3 py-2 font-ui text-sm text-accent-danger">
                {localeError}
              </p>
            )}
            <button
              onClick={handleCustomSave}
              disabled={updateLocale.isPending}
              className="self-start rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateLocale.isPending ? "Saving…" : "Save custom locale"}
            </button>
          </div>
        </div>
      )}

      {!showCustom && localPreset !== "custom" && (
        <button
          onClick={() => setShowCustom(true)}
          className="self-start rounded-md border border-border-default px-4 py-2 font-ui text-sm text-text-secondary hover:bg-surface-hover"
        >
          Custom…
        </button>
      )}
    </div>
  );
}

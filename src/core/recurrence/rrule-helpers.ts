import { RRule, Options as RRuleOptions } from "rrule";
import { formatDateUTCSafe, type LocaleSettings } from "@/core/locale/formatters";

const RRULE_FALLBACK_LOCALE: LocaleSettings = {
  date_format: "MMM D, YYYY",
  time_format: "12h",
  number_format: "1,234.56",
  currency_code: "USD",
  currency_symbol: "$",
  language: "en",
};

export type RecurrenceAnchor = "due_date" | "completion_date";

/**
 * Compute the next occurrence date given:
 *   - an RRULE string (e.g. "FREQ=WEEKLY;BYDAY=MO")
 *   - the anchor mode ("due_date" | "completion_date")
 *   - the date when the task was completed
 *   - the task's current due date (used as anchor for due_date mode)
 *
 * Returns null if no next occurrence can be computed.
 *
 * The key insight: rrule needs a dtstart to know where to begin iterating.
 * We set dtstart = anchor date so that .after(anchor, false) finds the
 * next occurrence strictly after that point. This ensures correctness for
 * monthly, yearly, and weekday-based rules.
 */
export function computeNextOccurrence(
  rule: string,
  anchor: RecurrenceAnchor,
  completedAt: Date,
  dueDate: Date | null,
): Date | null {
  try {
    const rruleStr = rule.startsWith("RRULE:") ? rule : `RRULE:${rule}`;
    const rrule = RRule.fromString(rruleStr);

    // Determine the anchor date — the baseline from which the next occurrence is calculated.
    const anchorDate = anchor === "completion_date" ? completedAt : (dueDate ?? completedAt);

    // Build new options with dtstart set to anchorDate so iteration begins there.
    const opts: Partial<RRuleOptions> = {
      ...rrule.origOptions,
      dtstart: anchorDate,
      // Clear count/until so we can always get a "next" from the anchor
      count: undefined,
      until: undefined,
    };

    // Preserve original count/until only if they exist and should constrain iteration.
    if (rrule.origOptions.count != null) {
      opts.count = rrule.origOptions.count;
    }
    if (rrule.origOptions.until != null) {
      opts.until = rrule.origOptions.until as Date;
    }

    const newRrule = new RRule(opts);
    // .after(anchorDate, false) — strictly after anchorDate, not inclusive.
    const next = newRrule.after(anchorDate, false);
    return next ?? null;
  } catch {
    return null;
  }
}

const DAY_MAP: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

const FREQ_LABEL: Record<number, string> = {
  0: "yearly",
  1: "monthly",
  2: "weekly",
  3: "daily",
  4: "hourly",
};

/**
 * Produce a human-readable summary of a recurrence rule + anchor.
 * Examples:
 *   "Daily · From completion date · No end"
 *   "Weekly on Mon, Wed, Fri · From due date · Ends Jan 1, 2026"
 */
export function describeRule(
  rule: string,
  anchor: RecurrenceAnchor,
  locale?: LocaleSettings,
): string {
  try {
    const rruleStr = rule.startsWith("RRULE:") ? rule : `RRULE:${rule}`;
    const rrule = RRule.fromString(rruleStr);
    const opts = rrule.origOptions;

    const freq = opts.freq ?? 2;
    const interval = (opts.interval ?? 1) as number;
    const freqLabel = FREQ_LABEL[freq] ?? "recurring";

    let freqDesc: string;
    if (interval === 1) {
      freqDesc = freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1);
    } else {
      freqDesc = `Every ${interval} ${freqLabel === "weekly" ? "weeks" : freqLabel === "monthly" ? "months" : freqLabel === "daily" ? "days" : freqLabel + "s"}`;
    }

    const bydays = opts.byweekday;
    if (bydays && Array.isArray(bydays) && bydays.length > 0) {
      const dayNames = bydays.map((d) => {
        if (typeof d === "number") {
          const keys = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
          return DAY_MAP[keys[d] ?? ""] ?? String(d);
        }
        const dayStr = String(d).replace(/[^A-Z]/g, "");
        return DAY_MAP[dayStr] ?? dayStr;
      });
      freqDesc += ` on ${dayNames.join(", ")}`;
    }

    const anchorDesc = anchor === "completion_date" ? "From completion date" : "From due date";

    let endDesc = "No end";
    if (opts.count != null) {
      endDesc = `After ${opts.count} time${opts.count === 1 ? "" : "s"}`;
    } else if (opts.until) {
      const d = opts.until instanceof Date ? opts.until : new Date(opts.until as string);
      endDesc = `Until ${formatDateUTCSafe(d, locale ?? RRULE_FALLBACK_LOCALE)}`;
    }

    return `${freqDesc} · ${anchorDesc} · ${endDesc}`;
  } catch {
    return "Custom recurrence";
  }
}

/**
 * For COUNT-based rules, decrement COUNT by 1 when creating the next occurrence.
 * Returns the modified RRULE string, or null if the chain should end
 * (i.e., COUNT was 1, meaning this is the last occurrence).
 *
 * For rules without COUNT or with UNTIL, returns the rule unchanged.
 */
export function ruleForNextOccurrence(rule: string): string | null {
  try {
    const rruleStr = rule.startsWith("RRULE:") ? rule : `RRULE:${rule}`;
    const rrule = RRule.fromString(rruleStr);
    const count = rrule.origOptions.count;

    if (count == null) {
      // No COUNT: rule is unchanged (UNTIL-based or infinite)
      return rule;
    }

    if (count <= 1) {
      // This was the last occurrence — don't give the child a recurrence_rule
      return null;
    }

    // Rebuild rule with COUNT decremented
    const newOpts: Partial<RRuleOptions> = {
      ...rrule.origOptions,
      count: count - 1,
      // Clear dtstart so we don't bake in a specific date
      dtstart: undefined,
    };
    const newRrule = new RRule(newOpts);
    // Strip "RRULE:" prefix since we store raw rule strings
    return newRrule.toString().replace(/^RRULE:/, "");
  } catch {
    return rule;
  }
}

/**
 * Build an RRULE string from component parts.
 */
export interface RRuleBuilderOptions {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  byweekday?: string[]; // e.g. ["MO", "WE", "FR"]
  count?: number | null;
  until?: Date | null;
}

export function buildRRule(opts: RRuleBuilderOptions): string {
  const parts: string[] = [];

  const freqMap: Record<string, string> = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  };
  parts.push(`FREQ=${freqMap[opts.freq]}`);

  if (opts.interval && opts.interval > 1) {
    parts.push(`INTERVAL=${opts.interval}`);
  }

  if (opts.byweekday && opts.byweekday.length > 0) {
    parts.push(`BYDAY=${opts.byweekday.join(",")}`);
  }

  if (opts.count != null && opts.count > 0) {
    parts.push(`COUNT=${opts.count}`);
  } else if (opts.until) {
    const d = opts.until;
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T000000Z`;
    parts.push(`UNTIL=${dateStr}`);
  }

  return parts.join(";");
}

/**
 * Parse an RRULE string into the custom form state used by RecurrenceForm.
 * Returns defaults if parsing fails.
 */
export interface RRuleFormState {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  days: string[];
  endMode: "never" | "count" | "date";
  endCount: number;
  endDate: string;
}

const FREQ_MAP: Record<number, RRuleFormState["freq"]> = {
  [RRule.DAILY]: "daily",
  [RRule.WEEKLY]: "weekly",
  [RRule.MONTHLY]: "monthly",
  [RRule.YEARLY]: "yearly",
};

const WEEKDAY_NAMES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function parseRuleToFormState(rule: string): RRuleFormState {
  const defaults: RRuleFormState = {
    freq: "weekly",
    interval: 1,
    days: [],
    endMode: "never",
    endCount: 5,
    endDate: "",
  };
  try {
    const rruleStr = rule.startsWith("RRULE:") ? rule : `RRULE:${rule}`;
    const rrule = RRule.fromString(rruleStr);
    const opts = rrule.origOptions;

    const freq = opts.freq != null ? (FREQ_MAP[opts.freq] ?? "weekly") : "weekly";
    const interval = opts.interval ?? 1;

    const days: string[] = [];
    if (Array.isArray(opts.byweekday)) {
      for (const wd of opts.byweekday) {
        const idx = typeof wd === "number" ? wd : (wd as { weekday: number }).weekday;
        if (idx >= 0 && idx < WEEKDAY_NAMES.length) {
          days.push(WEEKDAY_NAMES[idx]!);
        }
      }
    }

    let endMode: RRuleFormState["endMode"] = "never";
    let endCount = 5;
    let endDate = "";
    if (opts.count != null) {
      endMode = "count";
      endCount = opts.count;
    } else if (opts.until) {
      endMode = "date";
      const d = opts.until;
      const pad = (n: number) => String(n).padStart(2, "0");
      endDate = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }

    return { freq, interval, days, endMode, endCount, endDate };
  } catch {
    return defaults;
  }
}

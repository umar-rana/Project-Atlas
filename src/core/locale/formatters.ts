import { format as dateFnsFormat } from "date-fns";

export interface LocaleSettings {
  date_format: string;
  time_format: string;
  number_format: string;
  currency_code: string;
  currency_symbol: string;
}

const FORMAT_MAP: Record<string, string> = {
  "DD/MM/YYYY": "dd/MM/yyyy",
  "MM/DD/YYYY": "MM/dd/yyyy",
  "YYYY-MM-DD": "yyyy-MM-dd",
  "D MMM YYYY": "d MMM yyyy",
  "dd-mm-yyyy": "dd-MM-yyyy",
  "dd/mm/yyyy": "dd/MM/yyyy",
  "mm/dd/yyyy": "MM/dd/yyyy",
  "yyyy-mm-dd": "yyyy-MM-dd",
};

function toDateFnsFormat(fmt: string): string {
  return FORMAT_MAP[fmt] ?? FORMAT_MAP[fmt.toUpperCase()] ?? "dd/MM/yyyy";
}

export function formatDate(value: Date | string | null | undefined, locale: LocaleSettings): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const dfFmt = toDateFnsFormat(locale.date_format);
    return dateFnsFormat(d, dfFmt);
  } catch {
    return "";
  }
}

/**
 * Like `formatDate` but uses UTC date components (year/month/day) before
 * formatting. Use for date-only fields stored as UTC midnight in the DB
 * (e.g. due_date, defer_date) to prevent timezone-driven day-shifts.
 */
export function formatDateUTCSafe(value: Date | string | null | undefined, locale: LocaleSettings): string {
  if (!value) return "";
  try {
    const raw = value instanceof Date ? value : new Date(value);
    if (isNaN(raw.getTime())) return "";
    // Reconstruct as a local date from UTC components so midnight-UTC
    // values are displayed as the intended calendar day everywhere.
    const d = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate(), 12, 0, 0);
    const dfFmt = toDateFnsFormat(locale.date_format);
    return dateFnsFormat(d, dfFmt);
  } catch {
    return "";
  }
}

export function formatTime(value: Date | string | null | undefined, locale: LocaleSettings): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const fmt = locale.time_format === "24h" ? "HH:mm" : "h:mm a";
    return dateFnsFormat(d, fmt);
  } catch {
    return "";
  }
}

export function formatDateTime(value: Date | string | null | undefined, locale: LocaleSettings): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const datePart = formatDate(d, locale);
    const timePart = formatTime(d, locale);
    return `${datePart} ${timePart}`.trim();
  } catch {
    return "";
  }
}

function parseNumberFormat(numberFormat: string): { thousands: string; decimal: string } {
  if (numberFormat === "1.234,56") return { thousands: ".", decimal: "," };
  return { thousands: ",", decimal: "." };
}

export function formatNumber(value: number, locale: LocaleSettings): string {
  const { thousands, decimal } = parseNumberFormat(locale.number_format);
  const [intPart, fracPart] = Math.abs(value).toFixed(2).split(".");
  const intFormatted = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const result = fracPart !== undefined ? `${intFormatted}${decimal}${fracPart}` : intFormatted;
  return value < 0 ? `-${result}` : result;
}

export function formatCurrency(value: number, locale: LocaleSettings): string {
  const numStr = formatNumber(value, locale);
  return `${locale.currency_symbol}${numStr}`;
}

export function formatWeekdayFull(value: Date | string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    return dateFnsFormat(d, "EEEE");
  } catch {
    return "";
  }
}

export function formatWeekdayAbbrev(value: Date | string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    return dateFnsFormat(d, "EEE");
  } catch {
    return "";
  }
}

export function formatDayOfMonth(value: Date | string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    return dateFnsFormat(d, "d");
  } catch {
    return "";
  }
}

export function formatMonthAbbrev(value: Date | string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    return dateFnsFormat(d, "MMM");
  } catch {
    return "";
  }
}

export function formatRelativeDate(
  value: Date | string | null | undefined,
  locale: LocaleSettings,
): string {
  if (!value) return "";
  try {
    const raw = value instanceof Date ? value : new Date(value);
    if (isNaN(raw.getTime())) return "";
    // Use UTC date components for date-only fields (midnight-UTC storage) to
    // avoid timezone-driven day-shifts in relative labels.
    const targetY = raw.getUTCFullYear();
    const targetM = raw.getUTCMonth();
    const targetD = raw.getUTCDate();
    const now = new Date();
    const todayY = now.getUTCFullYear();
    const todayM = now.getUTCMonth();
    const todayDN = now.getUTCDate();
    const targetMs = Date.UTC(targetY, targetM, targetD);
    const todayMs = Date.UTC(todayY, todayM, todayDN);
    const diff = Math.round((targetMs - todayMs) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return formatDateUTCSafe(raw, locale);
  } catch {
    return "";
  }
}

import { format as dateFnsFormat } from "date-fns";
import type { Locale } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { ar } from "date-fns/locale/ar";
import { arSA } from "date-fns/locale/ar-SA";
import { hi } from "date-fns/locale/hi";
import { faIR } from "date-fns/locale/fa-IR";
import { fr } from "date-fns/locale/fr";
import { de } from "date-fns/locale/de";
import { es } from "date-fns/locale/es";
import { tr } from "date-fns/locale/tr";
import { zhCN } from "date-fns/locale/zh-CN";
import { ja } from "date-fns/locale/ja";
import { ko } from "date-fns/locale/ko";
import { ru } from "date-fns/locale/ru";
import { ptBR } from "date-fns/locale/pt-BR";
import { it } from "date-fns/locale/it";
import { nl } from "date-fns/locale/nl";
import { pl } from "date-fns/locale/pl";
import { uk } from "date-fns/locale/uk";
import { id } from "date-fns/locale/id";
import { ms } from "date-fns/locale/ms";

export interface LocaleSettings {
  date_format: string;
  time_format: string;
  number_format: string;
  currency_code: string;
  currency_symbol: string;
  language: string;
}

const LANGUAGE_TO_DATE_FNS_LOCALE: Record<string, Locale> = {
  en: enUS,
  "en-US": enUS,
  ar: ar,
  "ar-SA": arSA,
  hi: hi,
  "fa-IR": faIR,
  fr: fr,
  de: de,
  es: es,
  tr: tr,
  "zh-CN": zhCN,
  ja: ja,
  ko: ko,
  ru: ru,
  "pt-BR": ptBR,
  it: it,
  nl: nl,
  pl: pl,
  uk: uk,
  id: id,
  ms: ms,
};

export function getDateFnsLocale(language: string | undefined): Locale | undefined {
  if (!language) return enUS;
  return LANGUAGE_TO_DATE_FNS_LOCALE[language];
}

/**
 * Format a date string using date-fns, with Intl.DateTimeFormat fallback for
 * languages that do not have a date-fns locale (e.g. Urdu "ur").
 * For formats that contain a text month token (MMM), the month name is
 * injected via Intl when no date-fns locale exists.
 */
function dateFnsFormatWithFallback(d: Date, dfFmt: string, language: string): string {
  const locale = LANGUAGE_TO_DATE_FNS_LOCALE[language];
  if (locale) {
    return dateFnsFormat(d, dfFmt, { locale });
  }
  if (dfFmt.includes("MMM")) {
    try {
      const monthName = new Intl.DateTimeFormat(language, { month: "short" }).format(d);
      const tempFmt = dfFmt.replace("MMM", "'__MONTH__'");
      return dateFnsFormat(d, tempFmt).replace("__MONTH__", monthName);
    } catch {
      return dateFnsFormat(d, dfFmt);
    }
  }
  return dateFnsFormat(d, dfFmt);
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

export function formatDate(
  value: Date | string | null | undefined,
  locale: LocaleSettings,
): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const dfFmt = toDateFnsFormat(locale.date_format);
    return dateFnsFormatWithFallback(d, dfFmt, locale.language);
  } catch {
    return "";
  }
}

/**
 * Like `formatDate` but uses UTC date components (year/month/day) before
 * formatting. Use for date-only fields stored as UTC midnight in the DB
 * (e.g. due_date, defer_date) to prevent timezone-driven day-shifts.
 */
export function formatDateUTCSafe(
  value: Date | string | null | undefined,
  locale: LocaleSettings,
): string {
  if (!value) return "";
  try {
    const raw = value instanceof Date ? value : new Date(value);
    if (isNaN(raw.getTime())) return "";
    // Reconstruct as a local date from UTC components so midnight-UTC
    // values are displayed as the intended calendar day everywhere.
    const d = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate(), 12, 0, 0);
    const dfFmt = toDateFnsFormat(locale.date_format);
    return dateFnsFormatWithFallback(d, dfFmt, locale.language);
  } catch {
    return "";
  }
}

export function formatTime(
  value: Date | string | null | undefined,
  locale: LocaleSettings,
): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const fmt = locale.time_format === "24h" ? "HH:mm" : "h:mm a";
    const dfLocale = getDateFnsLocale(locale.language);
    return dateFnsFormat(d, fmt, dfLocale ? { locale: dfLocale } : undefined);
  } catch {
    return "";
  }
}

export function formatDateTime(
  value: Date | string | null | undefined,
  locale: LocaleSettings,
): string {
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

export function formatInt(value: number, locale: LocaleSettings): string {
  const { thousands } = parseNumberFormat(locale.number_format);
  const abs = Math.abs(Math.round(value));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return value < 0 ? `-${formatted}` : formatted;
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

export function formatWeekdayFull(value: Date | string, language?: string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    const lang = language ?? "en";
    const dfLocale = LANGUAGE_TO_DATE_FNS_LOCALE[lang];
    if (dfLocale) {
      return dateFnsFormat(d, "EEEE", { locale: dfLocale });
    }
    return new Intl.DateTimeFormat(lang, { weekday: "long" }).format(d);
  } catch {
    return "";
  }
}

export function formatWeekdayAbbrev(value: Date | string, language?: string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    const lang = language ?? "en";
    const dfLocale = LANGUAGE_TO_DATE_FNS_LOCALE[lang];
    if (dfLocale) {
      return dateFnsFormat(d, "EEE", { locale: dfLocale });
    }
    return new Intl.DateTimeFormat(lang, { weekday: "short" }).format(d);
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

export function formatMonthAbbrev(value: Date | string, language?: string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    const lang = language ?? "en";
    const dfLocale = LANGUAGE_TO_DATE_FNS_LOCALE[lang];
    if (dfLocale) {
      return dateFnsFormat(d, "MMM", { locale: dfLocale });
    }
    return new Intl.DateTimeFormat(lang, { month: "short" }).format(d);
  } catch {
    return "";
  }
}

const RELATIVE_DATE_LABELS: Record<string, { today: string; tomorrow: string; yesterday: string }> =
  {
    en: { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" },
    "en-US": { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" },
    ur: { today: "آج", tomorrow: "کل", yesterday: "گزشتہ کل" },
    ar: { today: "اليوم", tomorrow: "غداً", yesterday: "أمس" },
    "ar-SA": { today: "اليوم", tomorrow: "غداً", yesterday: "أمس" },
    "fa-IR": { today: "امروز", tomorrow: "فردا", yesterday: "دیروز" },
    hi: { today: "आज", tomorrow: "कल", yesterday: "बीता कल" },
    ms: { today: "Hari ini", tomorrow: "Esok", yesterday: "Semalam" },
    id: { today: "Hari ini", tomorrow: "Besok", yesterday: "Kemarin" },
    tr: { today: "Bugün", tomorrow: "Yarın", yesterday: "Dün" },
    fr: { today: "Aujourd'hui", tomorrow: "Demain", yesterday: "Hier" },
    de: { today: "Heute", tomorrow: "Morgen", yesterday: "Gestern" },
    es: { today: "Hoy", tomorrow: "Mañana", yesterday: "Ayer" },
    it: { today: "Oggi", tomorrow: "Domani", yesterday: "Ieri" },
    nl: { today: "Vandaag", tomorrow: "Morgen", yesterday: "Gisteren" },
    pl: { today: "Dzisiaj", tomorrow: "Jutro", yesterday: "Wczoraj" },
    "pt-BR": { today: "Hoje", tomorrow: "Amanhã", yesterday: "Ontem" },
    ru: { today: "Сегодня", tomorrow: "Завтра", yesterday: "Вчера" },
    uk: { today: "Сьогодні", tomorrow: "Завтра", yesterday: "Вчора" },
    "zh-CN": { today: "今天", tomorrow: "明天", yesterday: "昨天" },
    ja: { today: "今日", tomorrow: "明日", yesterday: "昨日" },
    ko: { today: "오늘", tomorrow: "내일", yesterday: "어제" },
  };

const RELATIVE_DATE_FALLBACK = RELATIVE_DATE_LABELS["en"]!;

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
    const labels = RELATIVE_DATE_LABELS[locale.language] ?? RELATIVE_DATE_FALLBACK;
    if (diff === 0) return labels.today;
    if (diff === 1) return labels.tomorrow;
    if (diff === -1) return labels.yesterday;
    return formatDateUTCSafe(raw, locale);
  } catch {
    return "";
  }
}

import {
  format,
  parse,
  isToday as dateFnsIsToday,
  isThisWeek as dateFnsIsThisWeek,
  parseISO,
  startOfDay,
  addDays,
  subDays,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export interface UserDatePrefs {
  timezone: string;
  date_format: string;
  time_format: string;
}

const FORMAT_MAP: Record<string, string> = {
  "DD/MM/YYYY": "dd/MM/yyyy",
  "MM/DD/YYYY": "MM/dd/yyyy",
  "YYYY-MM-DD": "yyyy-MM-dd",
  "D MMM YYYY": "d MMM yyyy",
};

function toDateFnsFormat(fmt: string): string {
  return FORMAT_MAP[fmt] ?? "dd/MM/yyyy";
}

export function now(): Date {
  return new Date();
}

export function toUserTimezone(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

export function formatDate(date: Date, prefs: UserDatePrefs): string {
  const zoned = toZonedTime(date, prefs.timezone);
  return format(zoned, toDateFnsFormat(prefs.date_format));
}

export function formatTime(date: Date, prefs: UserDatePrefs): string {
  const zoned = toZonedTime(date, prefs.timezone);
  return format(zoned, prefs.time_format === "12h" ? "h:mm a" : "HH:mm");
}

export function formatDateTime(date: Date, prefs: UserDatePrefs): string {
  const zoned = toZonedTime(date, prefs.timezone);
  const datePart = format(zoned, toDateFnsFormat(prefs.date_format));
  const timePart = format(zoned, prefs.time_format === "12h" ? "h:mm a" : "HH:mm");
  return `${datePart} ${timePart}`;
}

export function today(timezone: string): Date {
  const now = new Date();
  const zoned = toZonedTime(now, timezone);
  return startOfDay(zoned);
}

export function yesterday(timezone: string): Date {
  return subDays(today(timezone), 1);
}

export function tomorrow(timezone: string): Date {
  return addDays(today(timezone), 1);
}

export function parseUserDate(dateStr: string, prefs: UserDatePrefs): Date {
  const fmt = toDateFnsFormat(prefs.date_format);
  const reference = new Date();

  const byFormat = parse(dateStr, fmt, reference);
  if (!isNaN(byFormat.getTime())) {
    return fromZonedTime(byFormat, prefs.timezone);
  }

  const byISO = parseISO(dateStr);
  if (!isNaN(byISO.getTime())) return byISO;

  throw new Error(`Cannot parse date: "${dateStr}" using format "${fmt}"`);
}

export function isToday(date: Date, timezone: string): boolean {
  const zoned = toZonedTime(date, timezone);
  const todayZoned = today(timezone);
  return dateFnsIsToday(zoned) || zoned.toDateString() === todayZoned.toDateString();
}

export function isThisWeek(date: Date, timezone: string): boolean {
  const zoned = toZonedTime(date, timezone);
  return dateFnsIsThisWeek(zoned);
}

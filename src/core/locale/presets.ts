import type { LocaleSettings } from "./formatters";

export type LocalePresetKey = "pakistan" | "us" | "uk" | "custom";

export interface LocalePreset {
  key: LocalePresetKey;
  label: string;
  settings: LocaleSettings;
}

export const LOCALE_PRESETS: LocalePreset[] = [
  {
    key: "pakistan",
    label: "Pakistan (PKR)",
    settings: {
      date_format: "DD/MM/YYYY",
      time_format: "12h",
      number_format: "1,234.56",
      currency_code: "PKR",
      currency_symbol: "₨",
    },
  },
  {
    key: "us",
    label: "United States (USD)",
    settings: {
      date_format: "MM/DD/YYYY",
      time_format: "12h",
      number_format: "1,234.56",
      currency_code: "USD",
      currency_symbol: "$",
    },
  },
  {
    key: "uk",
    label: "United Kingdom (GBP)",
    settings: {
      date_format: "DD/MM/YYYY",
      time_format: "24h",
      number_format: "1,234.56",
      currency_code: "GBP",
      currency_symbol: "£",
    },
  },
  {
    key: "custom",
    label: "Custom",
    settings: {
      date_format: "DD/MM/YYYY",
      time_format: "12h",
      number_format: "1,234.56",
      currency_code: "USD",
      currency_symbol: "$",
    },
  },
];

export const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];
export const NUMBER_FORMAT_OPTIONS = [
  { value: "1,234.56", label: "1,234.56 (comma thousands, dot decimal)" },
  { value: "1.234,56", label: "1.234,56 (dot thousands, comma decimal)" },
];
export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour (e.g. 3:45 PM)" },
  { value: "24h", label: "24-hour (e.g. 15:45)" },
];

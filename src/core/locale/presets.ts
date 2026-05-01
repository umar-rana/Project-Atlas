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

export const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

export const ISO_4217_CURRENCY_CODES = new Set([
  "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN",
  "BAM","BBD","BDT","BGN","BHD","BIF","BMD","BND","BOB","BOV","BRL","BSD","BTN","BWP","BYN","BZD",
  "CAD","CDF","CHE","CHF","CHW","CLF","CLP","CNY","COP","COU","CRC","CUC","CUP","CVE","CZK",
  "DJF","DKK","DOP","DZD",
  "EGP","ERN","ETB","EUR",
  "FJD","FKP",
  "GBP","GEL","GHS","GIP","GMD","GNF","GTQ","GYD",
  "HKD","HNL","HRK","HTG","HUF",
  "IDR","ILS","INR","IQD","IRR","ISK",
  "JMD","JOD","JPY",
  "KES","KGS","KHR","KMF","KPW","KRW","KWD","KYD","KZT",
  "LAK","LBP","LKR","LRD","LSL","LYD",
  "MAD","MDL","MGA","MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MXV","MYR","MZN",
  "NAD","NGN","NIO","NOK","NPR","NZD",
  "OMR",
  "PAB","PEN","PGK","PHP","PKR","PLN","PYG",
  "QAR",
  "RON","RSD","RUB","RWF",
  "SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLL","SOS","SRD","STN","SVC","SYP","SZL",
  "THB","TJS","TMT","TND","TOP","TRY","TTD","TWD","TZS",
  "UAH","UGX","USD","USN","UYI","UYU","UYW","UZS",
  "VES","VND","VUV",
  "WST",
  "XAF","XAG","XAU","XBA","XBB","XBC","XBD","XCD","XDR","XOF","XPD","XPF","XPT","XSU","XTS","XUA","XXX",
  "YER",
  "ZAR","ZMW","ZWL",
]);
export const NUMBER_FORMAT_OPTIONS = [
  { value: "1,234.56", label: "1,234.56 (comma thousands, dot decimal)" },
  { value: "1.234,56", label: "1.234,56 (dot thousands, comma decimal)" },
];
export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour (e.g. 3:45 PM)" },
  { value: "24h", label: "24-hour (e.g. 15:45)" },
];

"use client";

import { trpc } from "@/lib/trpc/client";
import type { LocaleSettings } from "./formatters";

const DEFAULT_LOCALE: LocaleSettings = {
  date_format: "DD/MM/YYYY",
  time_format: "12h",
  number_format: "1,234.56",
  currency_code: "PKR",
  currency_symbol: "₨",
  language: "ur",
};

export function useLocale(): LocaleSettings {
  const { data: user } = trpc.user.me.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (!user) return DEFAULT_LOCALE;

  return {
    date_format: user.date_format ?? DEFAULT_LOCALE.date_format,
    time_format: user.time_format ?? DEFAULT_LOCALE.time_format,
    number_format: user.number_format ?? DEFAULT_LOCALE.number_format,
    currency_code: user.currency_code ?? DEFAULT_LOCALE.currency_code,
    currency_symbol: user.currency_symbol ?? DEFAULT_LOCALE.currency_symbol,
    language: user.language ?? DEFAULT_LOCALE.language,
  };
}

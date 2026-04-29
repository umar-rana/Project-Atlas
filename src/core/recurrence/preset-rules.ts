export type PresetName = "daily" | "weekday" | "weekly" | "biweekly" | "monthly" | "yearly";

export const PRESET_RULES: Record<PresetName, string> = {
  daily: "FREQ=DAILY",
  weekday: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export const PRESET_LABELS: Record<PresetName, string> = {
  daily: "Daily",
  weekday: "Every weekday",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function ruleToPreset(rule: string | null | undefined): PresetName | "custom" | "none" {
  if (!rule) return "none";
  const norm = rule.toUpperCase().replace(/;+$/, "");
  for (const [name, preset] of Object.entries(PRESET_RULES) as [PresetName, string][]) {
    if (norm === preset.toUpperCase()) return name;
  }
  return "custom";
}

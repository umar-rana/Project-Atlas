import { capitalizeProjectType } from "./type-validation";

const CURATED_DEFAULTS = ["travel", "learning", "health", "reading"];

export interface TypeUsage {
  type: string;
  count: number;
}

/**
 * Returns a list of up to 4 suggested types for the picker.
 *
 * Priority model:
 * 1. Build a "priority pool" of:
 *    a. Curated defaults already used by the user (sorted by count desc)
 *    b. Non-core, non-curated user types with count >= 2 (sorted by count desc)
 *    Both compete by count — higher usage wins a slot regardless of category.
 * 2. Fill remaining slots (up to 4) with unused curated defaults (original order).
 *
 * This guarantees high-usage custom types appear when they have more usage than
 * some curated defaults, while curated defaults always fill leftover slots.
 *
 * Core types (project, goal) are always excluded.
 */
export function getSuggestedTypes(existingTypes: TypeUsage[]): string[] {
  const coreTypes = new Set(["project", "goal"]);
  const curatedSet = new Set(CURATED_DEFAULTS);
  const existingByType = new Map(existingTypes.map((t) => [t.type, t.count]));

  // High-priority pool: used-curated + non-curated with count>=2, sorted by count desc
  const usedCurated = CURATED_DEFAULTS.filter((t) => existingByType.has(t)).map((t) => ({
    type: t,
    count: existingByType.get(t)!,
  }));

  const highUsageCustom = existingTypes
    .filter((t) => !coreTypes.has(t.type) && !curatedSet.has(t.type) && t.count >= 2)
    .map((t) => ({ type: t.type, count: t.count }));

  const priorityPool = [...usedCurated, ...highUsageCustom].sort(
    (a, b) => b.count - a.count || a.type.localeCompare(b.type),
  );

  // Low-priority fill: unused curated types, in original curated order
  const unusedCurated = CURATED_DEFAULTS.filter((t) => !existingByType.has(t));

  const suggestions: string[] = [];
  for (const { type } of priorityPool) {
    if (!suggestions.includes(type)) suggestions.push(type);
    if (suggestions.length >= 4) break;
  }
  for (const type of unusedCurated) {
    if (!suggestions.includes(type)) suggestions.push(type);
    if (suggestions.length >= 4) break;
  }
  return suggestions;
}

export function displayType(type: string): string {
  return capitalizeProjectType(type);
}

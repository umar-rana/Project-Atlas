/**
 * Cadence suggestion logic for People (Wave 5a-ii).
 *
 * suggestCadence() computes the median gap (in days) between consecutive
 * interactions sorted by occurred_at and returns a rounded cadence suggestion.
 */

/** Compute the median of a sorted numeric array. Returns null for empty arrays. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Given a list of occurred_at timestamps (from non-deleted interactions),
 * computes the median inter-interaction gap and returns a rounded cadence
 * suggestion in days.
 *
 * Rounding rules:
 *   ≤ 10 days  → 7   (Weekly)
 *   ≤ 45 days  → 30  (Monthly)
 *   ≤ 120 days → 90  (Quarterly)
 *   ≤ 300 days → 180 (Semi-annually — maps to "Custom 180")
 *   > 300 days → 365 (Yearly)
 *
 * Returns null when fewer than 2 timestamps are provided (not enough to
 * compute any gap).
 */
export function suggestCadence(occurredAts: Date[]): number | null {
  if (occurredAts.length < 2) return null;

  // Sort ascending
  const sorted = [...occurredAts].sort((a, b) => a.getTime() - b.getTime());

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diffMs = sorted[i]!.getTime() - sorted[i - 1]!.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    gaps.push(diffDays);
  }

  gaps.sort((a, b) => a - b);
  const med = median(gaps);
  if (med === null) return null;

  if (med <= 10) return 7;
  if (med <= 45) return 30;
  if (med <= 120) return 90;
  if (med <= 300) return 180;
  return 365;
}

/**
 * Returns true if the cadence suggestion should be shown, given:
 *   - cadence_days is null (user has not set one yet)
 *   - at least 3 non-deleted interactions exist
 *   - suggestion is not suppressed by recent dismissal with similar value
 *
 * Re-suggestion suppression logic:
 *   After a dismissal, suppress until BOTH:
 *   1. 3 more interactions exist beyond the count at dismissal time, AND
 *   2. The newly computed median differs from the dismissed value by > 7 days.
 */
export function shouldShowCadenceSuggestion({
  cadenceDays,
  interactionCount,
  suggestedValue,
  dismissedAt,
  dismissedValue,
  interactionCountAtDismissal,
}: {
  cadenceDays: number | null;
  interactionCount: number;
  suggestedValue: number | null;
  dismissedAt: Date | null;
  dismissedValue: number | null;
  interactionCountAtDismissal: number;
}): boolean {
  if (cadenceDays !== null) return false;
  if (interactionCount < 3) return false;
  if (suggestedValue === null) return false;

  if (!dismissedAt) return true;

  const enoughNewInteractions = interactionCount >= interactionCountAtDismissal + 3;
  const valueDiffers = dismissedValue === null || Math.abs(suggestedValue - dismissedValue) > 7;

  return enoughNewInteractions && valueDiffers;
}

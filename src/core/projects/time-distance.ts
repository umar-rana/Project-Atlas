/**
 * Returns a relative time phrase for a future or past date from `to` (default: now).
 * Used for target dates.
 * 
 * Examples:
 *   future: "today", "tomorrow", "3 days away", "2 weeks away", "5 months away"
 *   past:   "today", "yesterday", "passed 3 days ago", "passed 2 weeks ago"
 */
export function timeDistance(from: Date, to: Date = new Date()): string {
  const diffMs = from.getTime() - to.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "passed yesterday";

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays < 7) return `passed ${absDays} days ago`;
    if (absDays < 14) return "passed 1 week ago";
    if (absDays < 30) return `passed ${Math.floor(absDays / 7)} weeks ago`;
    if (absDays < 60) return "passed 1 month ago";
    if (absDays < 365) return `passed ${Math.floor(absDays / 30)} months ago`;
    if (absDays < 730) return "passed 1 year ago";
    return `passed ${Math.floor(absDays / 365)} years ago`;
  } else {
    if (diffDays < 7) return `${diffDays} days away`;
    if (diffDays < 14) return "1 week away";
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks away`;
    if (diffDays < 60) return "1 month away";
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months away`;
    if (diffDays < 730) return "1 year away";
    return `${Math.floor(diffDays / 365)} years away`;
  }
}

/**
 * Returns "last activity" relative phrase for a past date within 30 days, or null.
 * 
 * Examples: "today", "yesterday", "3 days ago", "2 weeks ago"
 * Returns null if older than 30 days.
 */
export function timeDistancePast(date: Date, now: Date = new Date()): string | null {
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 30) return null;
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return null;
}

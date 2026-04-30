/**
 * Pure filter predicates used by the Today and Forecast perspectives.
 * Exported here so they can be unit-tested independently of Prisma.
 */

export interface TaskLike {
  due_date: Date | null;
  defer_date: Date | null;
  flagged: boolean;
  status: string;
}

/** Returns true when a task is NOT deferred (i.e. available right now). */
export function isNotDeferred(task: TaskLike, now: Date): boolean {
  if (task.defer_date === null) return true;
  return task.defer_date <= now;
}

/**
 * Returns true when a task belongs in the Today perspective.
 *
 * Rules:
 *  - must not be deferred
 *  - due today (due_date falls within [todayStart, todayEnd))
 *  - OR overdue (due_date < todayStart)
 *  - OR flagged (regardless of due_date)
 */
export function isInToday(task: TaskLike, now: Date): boolean {
  if (!isNotDeferred(task, now)) return false;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  if (task.due_date !== null) {
    if (task.due_date < todayEnd && task.due_date >= todayStart) return true;
    if (task.due_date < todayStart) return true;
  }

  if (task.flagged) return true;

  return false;
}

/**
 * Returns the ISO date key (YYYY-MM-DD) under which a task appears in
 * Forecast, or null if it falls outside the given range.
 *
 * Primary bucket: due_date matches the day.
 * Secondary bucket (no due_date): defer_date falls on the day, surfacing
 * tasks that become available on a given day so users can plan ahead.
 */
export function getForecastDayKey(task: TaskLike, start: Date, end: Date): string | null {
  // Primary: due_date bucketing.
  if (task.due_date) {
    if (task.due_date < start || task.due_date > end) return null;
    return task.due_date.toISOString().slice(0, 10);
  }
  // Secondary: defer_date bucketing for tasks with no due_date.
  if (task.defer_date) {
    const deferStart = new Date(task.defer_date);
    deferStart.setHours(0, 0, 0, 0);
    if (deferStart < start || deferStart > end) return null;
    return deferStart.toISOString().slice(0, 10);
  }
  return null;
}

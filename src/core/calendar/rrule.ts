import { RRule } from "rrule";

export interface ExpandedEvent {
  id: string;
  masterId: string;
  instanceDate: Date;
  isVirtual: boolean;
}

export function expandRRule(
  rule: string,
  dtstart: Date,
  windowStart: Date,
  windowEnd: Date,
  maxInstances = 500,
): Date[] {
  try {
    const rrule = new RRule({
      ...RRule.parseString(rule),
      dtstart,
    });

    const dates = rrule.between(windowStart, windowEnd, true);
    return dates.slice(0, maxInstances);
  } catch {
    return [];
  }
}

export function getHumanReadableRRule(rule: string): string {
  try {
    const rrule = new RRule(RRule.parseString(rule));
    return rrule.toText();
  } catch {
    return rule;
  }
}

export function expandEventsInWindow<
  T extends {
    id: string;
    start_at: Date;
    end_at: Date;
    recurrence_rule: string | null;
    recurrence_master_id: string | null;
    status: string;
    deleted_at: Date | null;
  },
>(
  events: T[],
  windowStart: Date,
  windowEnd: Date,
): Array<T & { _virtualDate?: Date; _originalId: string }> {
  const result: Array<T & { _virtualDate?: Date; _originalId: string }> = [];

  const masterEvents = events.filter(
    (e) => e.recurrence_rule && !e.recurrence_master_id && !e.deleted_at,
  );
  const overrideInstances = new Map<string, T>();
  for (const e of events) {
    if (e.recurrence_master_id) {
      overrideInstances.set(`${e.recurrence_master_id}:${e.start_at.toISOString()}`, e);
    }
  }

  const nonRecurringEvents = events.filter((e) => !e.recurrence_rule && !e.recurrence_master_id);

  for (const event of nonRecurringEvents) {
    if (event.start_at <= windowEnd && event.end_at >= windowStart) {
      result.push({ ...event, _originalId: event.id });
    }
  }

  for (const master of masterEvents) {
    const duration = master.end_at.getTime() - master.start_at.getTime();
    const dates = expandRRule(master.recurrence_rule!, master.start_at, windowStart, windowEnd);

    for (const instanceStart of dates) {
      const instanceKey = `${master.id}:${instanceStart.toISOString()}`;
      const override = overrideInstances.get(instanceKey);

      if (override) {
        if (!override.deleted_at && override.status !== "cancelled") {
          result.push({ ...override, _originalId: override.id });
        }
      } else {
        const instanceEnd = new Date(instanceStart.getTime() + duration);
        result.push({
          ...master,
          start_at: instanceStart,
          end_at: instanceEnd,
          _virtualDate: instanceStart,
          _originalId: master.id,
          id: `${master.id}:${instanceStart.toISOString()}`,
        });
      }
    }
  }

  return result.sort((a, b) => a.start_at.getTime() - b.start_at.getTime());
}

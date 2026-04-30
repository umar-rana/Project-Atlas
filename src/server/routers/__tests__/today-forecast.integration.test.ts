import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import type { User } from "@prisma/client";
import { tasksRouter } from "@/server/routers/tasks";
import { forecastRouter } from "@/server/routers/forecast";

// Uses the same URL-resolution order as @/core/db so both clients target the
// same database (DATABASE_URL_NEON takes precedence when set).
function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(
    /^'+|'+$/g,
    "",
  );
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let testUser: User;

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromToday(n: number): Date {
  const d = todayStart();
  d.setDate(d.getDate() + n);
  return d;
}

async function insertTask(opts: {
  title: string;
  due_date?: Date | null;
  defer_date?: Date | null;
  flagged?: boolean;
  status?: string;
}): Promise<string> {
  const task = await rawDb.task.create({
    data: {
      id: uuidv7(),
      user_id: testUser.id,
      title: opts.title,
      status: opts.status ?? "active",
      flagged: opts.flagged ?? false,
      due_date: opts.due_date ?? null,
      defer_date: opts.defer_date ?? null,
    },
  });
  return task.id;
}

beforeAll(async () => {
  testUser = await rawDb.user.create({
    data: {
      id: uuidv7(),
      email: `integration-test-${uuidv7()}@atlas.test`,
      name: "Integration Test User",
    },
  });
});

afterAll(async () => {
  await rawDb.$executeRaw`DELETE FROM "Task" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${testUser.id}::uuid`;
  await rawDb.$disconnect();
});

function makeTasksCaller() {
  return tasksRouter.createCaller({ user: testUser });
}

function makeForecastCaller() {
  return forecastRouter.createCaller({ user: testUser });
}

describe("Today perspective — tasksRouter.list", () => {
  let taskDueToday: string;
  let taskOverdue: string;
  let taskFlaggedFuture: string;
  let taskFlaggedDeferred: string;
  let taskDueTomorrow: string;
  let taskNoDateNoFlag: string;
  let taskDueTodayDeferredFuture: string;

  beforeAll(async () => {
    [
      taskDueToday,
      taskOverdue,
      taskFlaggedFuture,
      taskFlaggedDeferred,
      taskDueTomorrow,
      taskNoDateNoFlag,
      taskDueTodayDeferredFuture,
    ] = await Promise.all([
      insertTask({ title: "T: Due today", due_date: todayStart() }),
      insertTask({ title: "T: Overdue", due_date: daysFromToday(-2) }),
      insertTask({ title: "T: Flagged + future due_date", due_date: daysFromToday(5), flagged: true }),
      insertTask({ title: "T: Flagged + deferred tomorrow", flagged: true, defer_date: daysFromToday(1) }),
      insertTask({ title: "T: Due tomorrow", due_date: daysFromToday(1) }),
      insertTask({ title: "T: No date no flag" }),
      insertTask({ title: "T: Due today deferred tomorrow", due_date: todayStart(), defer_date: daysFromToday(1) }),
    ]);
  });

  async function getTodayIds(): Promise<string[]> {
    const tasks = await makeTasksCaller().list({ perspective: "today" });
    return tasks.map((t: { id: string }) => t.id);
  }

  it("includes a task due exactly today", async () => {
    expect(await getTodayIds()).toContain(taskDueToday);
  });

  it("includes an overdue task (due_date in the past)", async () => {
    expect(await getTodayIds()).toContain(taskOverdue);
  });

  it("includes a flagged task with a future due_date", async () => {
    expect(await getTodayIds()).toContain(taskFlaggedFuture);
  });

  it("excludes a flagged task whose defer_date is in the future", async () => {
    expect(await getTodayIds()).not.toContain(taskFlaggedDeferred);
  });

  it("excludes a task due tomorrow", async () => {
    expect(await getTodayIds()).not.toContain(taskDueTomorrow);
  });

  it("excludes a task with no due_date and no flag", async () => {
    expect(await getTodayIds()).not.toContain(taskNoDateNoFlag);
  });

  it("excludes a task due today but deferred until tomorrow", async () => {
    expect(await getTodayIds()).not.toContain(taskDueTodayDeferredFuture);
  });
});

describe("Forecast week — forecastRouter.week", () => {
  let taskDueTomorrow: string;
  let taskDueInFiveDays: string;
  let taskOverdue: string;
  let taskDeferredTomorrow: string;
  let taskDueTomorrowDeferredFarFuture: string;
  let taskDueOutsideRange: string;
  let taskCompleted: string;
  let taskDueToday: string;

  const DAYS = 7;

  beforeAll(async () => {
    [
      taskDueTomorrow,
      taskDueInFiveDays,
      taskOverdue,
      taskDeferredTomorrow,
      taskDueTomorrowDeferredFarFuture,
      taskDueOutsideRange,
      taskCompleted,
      taskDueToday,
    ] = await Promise.all([
      insertTask({ title: "F: Due tomorrow", due_date: daysFromToday(1) }),
      insertTask({ title: "F: Due in 5 days", due_date: daysFromToday(5) }),
      insertTask({ title: "F: Overdue 3 days ago", due_date: daysFromToday(-3) }),
      insertTask({ title: "F: Deferred to tomorrow (no due_date)", due_date: null, defer_date: daysFromToday(1) }),
      insertTask({ title: "F: Due tomorrow + deferred to 8 days", due_date: daysFromToday(1), defer_date: daysFromToday(8) }),
      insertTask({ title: "F: Due in 8 days (outside 7-day range)", due_date: daysFromToday(8) }),
      insertTask({ title: "F: Completed due tomorrow", due_date: daysFromToday(1), status: "completed" }),
      insertTask({ title: "F: Boundary due today", due_date: todayStart() }),
    ]);
  });

  async function getWeek() {
    return makeForecastCaller().week({ days: DAYS });
  }

  function scheduledIds(result: Awaited<ReturnType<typeof getWeek>>): string[] {
    return result.days.flatMap((d: { tasks: { id: string }[] }) => d.tasks.map((t) => t.id));
  }

  function overdueIds(result: Awaited<ReturnType<typeof getWeek>>): string[] {
    return result.overdue.map((t: { id: string }) => t.id);
  }

  it("includes a task due within the 7-day range in scheduled", async () => {
    expect(scheduledIds(await getWeek())).toContain(taskDueTomorrow);
  });

  it("includes a task due on day 5 of the 7-day range", async () => {
    expect(scheduledIds(await getWeek())).toContain(taskDueInFiveDays);
  });

  it("excludes a task due on day 8 (outside range) from scheduled", async () => {
    expect(scheduledIds(await getWeek())).not.toContain(taskDueOutsideRange);
  });

  it("includes a task with no due_date but defer_date in range (defer bucketing)", async () => {
    expect(scheduledIds(await getWeek())).toContain(taskDeferredTomorrow);
  });

  it("excludes a task whose defer_date is far future even if due_date is in range", async () => {
    // defer_date > now means the task is not yet available, so it is excluded
    // from activeScheduled; it has a due_date so also excluded from the
    // deferred-only query.
    expect(scheduledIds(await getWeek())).not.toContain(taskDueTomorrowDeferredFarFuture);
  });

  it("places an overdue task in the overdue array", async () => {
    expect(overdueIds(await getWeek())).toContain(taskOverdue);
  });

  it("does not place an overdue task in the scheduled days", async () => {
    expect(scheduledIds(await getWeek())).not.toContain(taskOverdue);
  });

  it("excludes a completed task from scheduled", async () => {
    expect(scheduledIds(await getWeek())).not.toContain(taskCompleted);
  });

  it("excludes a completed task from overdue", async () => {
    expect(overdueIds(await getWeek())).not.toContain(taskCompleted);
  });

  it("includes a task due today (day 0) in scheduled", async () => {
    expect(scheduledIds(await getWeek())).toContain(taskDueToday);
  });

  it("places a task due tomorrow in tomorrow's day bucket, not today's", async () => {
    const result = await getWeek();
    const tomorrowKey = daysFromToday(1).toISOString().slice(0, 10);
    const todayKey = todayStart().toISOString().slice(0, 10);
    const tomorrowDay = result.days.find((d: { date: string }) => d.date === tomorrowKey);
    const todayDay = result.days.find((d: { date: string }) => d.date === todayKey);
    expect(tomorrowDay?.tasks.map((t: { id: string }) => t.id)).toContain(taskDueTomorrow);
    expect(todayDay?.tasks.map((t: { id: string }) => t.id) ?? []).not.toContain(taskDueTomorrow);
  });

  it("places a defer-only task in the day bucket matching its defer_date", async () => {
    const result = await getWeek();
    const tomorrowKey = daysFromToday(1).toISOString().slice(0, 10);
    const tomorrowDay = result.days.find((d: { date: string }) => d.date === tomorrowKey);
    expect(tomorrowDay?.tasks.map((t: { id: string }) => t.id)).toContain(taskDeferredTomorrow);
  });
});

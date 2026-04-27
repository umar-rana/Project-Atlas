import { createLogger } from "@/core/logging";
import { db } from "@/core/db";
import { newId } from "@/core/db";

const log = createLogger({ module: "queue" });

export type Priority = "USER" | "BACKGROUND_HIGH" | "BACKGROUND_LOW";

export interface QueuedRequest<T> {
  id: string;
  priority: Priority;
  provider: string;
  userId: string;
  execute: () => Promise<T>;
  retries?: number;
}

interface ProviderLimits {
  windowMs: number;
  maxRequests: number;
}

const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
  google_drive: { windowMs: 100_000, maxRequests: 1_000 },
  claude_via_replit: { windowMs: 60_000, maxRequests: 60 },
};

const PROVIDER_DAILY_LIMITS: Record<string, number> = {
  google_drive: 10_000,
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  USER: 0,
  BACKGROUND_HIGH: 1,
  BACKGROUND_LOW: 2,
};

const MAX_RETRIES = 5;
const DEAD_LETTER: QueuedRequest<unknown>[] = [];

interface QueueEntry {
  priority: Priority;
  provider: string;
  userId: string;
  maxRetries: number;
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

const providerQueues = new Map<string, QueueEntry[]>();
const dispatching = new Set<string>();

function insertByPriority(queue: QueueEntry[], entry: QueueEntry): void {
  const order = PRIORITY_ORDER[entry.priority];
  const idx = queue.findIndex((e) => PRIORITY_ORDER[e.priority] > order);
  if (idx === -1) {
    queue.push(entry);
  } else {
    queue.splice(idx, 0, entry);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base: number): number {
  return base * (1 + Math.random() * 0.3);
}

async function checkDailyQuota(
  provider: string,
  userId: string,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const dailyLimit = PROVIDER_DAILY_LIMITS[provider];
  if (!dailyLimit) return { allowed: true };

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  try {
    const result = await db.rateLimitTracker.aggregate({
      where: { provider, user_id: userId, window_start: { gte: dayStart } },
      _sum: { request_count: true },
    });
    const total = result._sum.request_count ?? 0;
    if (total >= dailyLimit) {
      const tomorrow = new Date(dayStart);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const retryAfterMs = tomorrow.getTime() - Date.now();
      log.warn({ provider, userId, dailyCount: total, dailyLimit }, "Daily quota exceeded");
      return { allowed: false, retryAfterMs };
    }
    return { allowed: true };
  } catch (err) {
    log.warn({ err, provider, userId }, "Daily quota check failed — allowing request");
    return { allowed: true };
  }
}

async function checkAndUpdateRateLimit(
  provider: string,
  userId: string,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const limits = PROVIDER_LIMITS[provider];
  if (!limits) return { allowed: true };

  const dailyCheck = await checkDailyQuota(provider, userId);
  if (!dailyCheck.allowed) return dailyCheck;

  const now = new Date();
  const windowStart = new Date(now.getTime() - limits.windowMs);

  try {
    const tracker = await db.rateLimitTracker.findFirst({
      where: {
        provider,
        user_id: userId,
        window_start: { gte: windowStart },
      },
      orderBy: { window_start: "desc" },
    });

    if (!tracker) {
      await db.rateLimitTracker.create({
        data: {
          id: newId(),
          provider,
          user_id: userId,
          window_start: now,
          request_count: 1,
        },
      });
      return { allowed: true };
    }

    if (tracker.request_count >= limits.maxRequests) {
      const windowEnd = tracker.window_start.getTime() + limits.windowMs;
      const retryAfterMs = windowEnd - Date.now();
      log.warn({ provider, userId, requestCount: tracker.request_count, retryAfterMs }, "Rate limit hit");
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    await db.rateLimitTracker.update({
      where: { id: tracker.id },
      data: {
        request_count: { increment: 1 },
        daily_count: { increment: 1 },
      },
    });
    return { allowed: true };
  } catch (err) {
    log.warn({ err, provider, userId }, "Rate limit DB check failed — allowing request");
    return { allowed: true };
  }
}

async function dispatchProvider(provider: string): Promise<void> {
  if (dispatching.has(provider)) return;
  dispatching.add(provider);

  try {
    const queue = providerQueues.get(provider);
    if (!queue) return;

    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;

      let attempt = 0;
      const { task, userId, maxRetries, resolve, reject } = entry;

      let succeeded = false;
      while (attempt <= maxRetries) {
        const { allowed, retryAfterMs } = await checkAndUpdateRateLimit(provider, userId);
        if (!allowed) {
          const delay = retryAfterMs ?? jitter(5_000);
          log.warn({ provider, userId, delay, priority: entry.priority }, "Rate limited — waiting in queue");
          await sleep(delay);
          continue;
        }

        try {
          const result = await task();
          log.debug({ provider, userId, priority: entry.priority, attempt }, "Queue task succeeded");
          resolve(result);
          succeeded = true;
          break;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const isRetryable = status === 429 || (status !== undefined && status >= 500);
          if (!isRetryable || attempt === maxRetries) {
            log.error({ err, provider, userId, attempt }, "Queue task failed — dead-lettered");
            DEAD_LETTER.push({ id: newId(), priority: entry.priority, provider, userId, execute: task, retries: maxRetries } as QueuedRequest<unknown>);
            reject(err);
            succeeded = true;
            break;
          }
          const delay = jitter(Math.min(1000 * 2 ** attempt, 30_000));
          log.warn({ provider, userId, attempt, delay, status }, "Queue task retrying");
          await sleep(delay);
          attempt++;
        }
      }

      if (!succeeded) {
        reject(new Error("Queue exhausted retries"));
      }
    }
  } finally {
    dispatching.delete(provider);
  }
}

export function enqueue<T>(req: QueuedRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!providerQueues.has(req.provider)) {
      providerQueues.set(req.provider, []);
    }

    const queue = providerQueues.get(req.provider)!;
    const entry: QueueEntry = {
      priority: req.priority,
      provider: req.provider,
      userId: req.userId,
      maxRetries: req.retries ?? MAX_RETRIES,
      task: req.execute as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    };

    insertByPriority(queue, entry);
    log.debug(
      { provider: req.provider, priority: req.priority, userId: req.userId, queueDepth: queue.length },
      "Task enqueued",
    );

    void dispatchProvider(req.provider);
  });
}

export function getProviderConfig(provider: string): ProviderLimits | undefined {
  return PROVIDER_LIMITS[provider];
}

export function getDeadLetterCount(): number {
  return DEAD_LETTER.length;
}

export function isQueueHealthy(): boolean {
  return DEAD_LETTER.length === 0;
}

export function getQueueDepth(provider?: string): number {
  if (provider) {
    return providerQueues.get(provider)?.length ?? 0;
  }
  let total = 0;
  for (const q of providerQueues.values()) total += q.length;
  return total;
}

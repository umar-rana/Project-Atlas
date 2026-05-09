import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { PersistentRateLimitOptions, PersistentRateLimitResult } from "./persistent";
import { checkPersistentRateLimit } from "./persistent";

const log = createLogger({ module: "rate-limit/hybrid" });

interface LocalBucket {
  bucketStartMs: number;
  count: number;
}

// In-memory per-process counter keyed by `${userId}:${bucket}`. Holds the
// current window's tally only — when a request arrives for a newer bucket the
// stale entry is overwritten in place, so the map is bounded by
// (active users × distinct buckets) rather than growing over time.
//
// A safety sweeper still runs every minute to drop entries whose window is
// more than 5 minutes stale (covers users who go silent mid-window).
const localBuckets = new Map<string, LocalBucket>();

const SWEEP_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

function startSweeper(): void {
  // Browser-side / test environments shouldn't spin up the interval.
  if (typeof setInterval !== "function") return;
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of localBuckets) {
      if (now - entry.bucketStartMs > STALE_AFTER_MS) {
        localBuckets.delete(key);
      }
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the sweeper.
  if (typeof handle === "object" && handle && "unref" in handle) {
    (handle as { unref: () => void }).unref();
  }
}
startSweeper();

function bumpLocal(key: string, bucketStartMs: number): number {
  const entry = localBuckets.get(key);
  if (!entry || entry.bucketStartMs !== bucketStartMs) {
    localBuckets.set(key, { bucketStartMs, count: 1 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Async, fire-and-forget DB upsert that mirrors the in-memory increment so
 * that other instances and post-restart Postgres counts stay roughly accurate.
 *
 * Errors are logged but never thrown — this runs outside the request lifetime.
 */
async function persistAsync(
  opts: PersistentRateLimitOptions,
  windowStart: Date,
): Promise<void> {
  try {
    await db.rateLimitTracker.upsert({
      where: {
        user_id_provider_window_start: {
          user_id: opts.userId,
          provider: opts.bucket,
          window_start: windowStart,
        },
      },
      create: {
        id: newId(),
        user_id: opts.userId,
        provider: opts.bucket,
        window_start: windowStart,
        request_count: 1,
      },
      update: { request_count: { increment: 1 } },
    });
  } catch (err) {
    log.warn(
      { err, userId: opts.userId, bucket: opts.bucket },
      "Hybrid rate limit: background persist failed",
    );
  }
}

/**
 * Hybrid in-memory + Postgres rate limiter (audit perf-2).
 *
 * The per-process Map handles the happy path: incrementing a counter and
 * comparing it against the configured limit. For requests that stay under
 * the cap a single fire-and-forget upsert is dispatched to RateLimitTracker
 * so other instances and post-restart counts remain roughly correct, but
 * the request itself returns immediately — eliminating the 10–50ms blocking
 * upsert that `checkPersistentRateLimit` previously imposed on every call.
 *
 * When the in-memory counter reaches the cap we fall through to
 * `checkPersistentRateLimit` for an authoritative DB-confirmed answer.
 * This keeps the hard limit cross-instance correct without the per-request
 * DB write tax on the common case.
 *
 * Trade-offs:
 *  - In a multi-instance deployment, *under-the-cap* traffic isn't perfectly
 *    coordinated across instances (each instance's local bucket is independent
 *    until the fire-and-forget write lands). The DB count converges within a
 *    second or two, so the worst-case overshoot is bounded by
 *    `instances × maxRequests`. For Atlas's single-instance Replit deployment
 *    this is moot.
 *  - Crashes between the in-memory increment and the background upsert lose
 *    that increment. Acceptable for a burst limiter; the daily cost cap
 *    (checkHelpChatLimits) reads AICallLog directly and is not affected.
 */
export async function checkHybridRateLimit(
  opts: PersistentRateLimitOptions,
): Promise<PersistentRateLimitResult> {
  const now = Date.now();
  const bucketStartMs = Math.floor(now / opts.windowMs) * opts.windowMs;
  const key = `${opts.userId}:${opts.bucket}`;

  const localCount = bumpLocal(key, bucketStartMs);

  if (localCount <= opts.maxRequests) {
    // Happy path: respond now, persist in the background.
    void persistAsync(opts, new Date(bucketStartMs));
    return { allowed: true, retryAfterSec: 0 };
  }

  // Local says we're over — confirm with the authoritative DB count before
  // denying. Other instances may have served fewer requests, in which case
  // the user is still under the cap globally.
  return checkPersistentRateLimit(opts);
}

// ── Test-only helpers ───────────────────────────────────────────────────────
// Exported so tests can reset state between cases. Not part of the public API.
export const __testing = {
  reset: () => localBuckets.clear(),
  size: () => localBuckets.size,
  peek: (key: string) => localBuckets.get(key),
};

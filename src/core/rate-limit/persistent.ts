import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "rate-limit/persistent" });

export interface PersistentRateLimitOptions {
  /** Internal user UUID. */
  userId: string;
  /**
   * Namespace for the bucket, e.g. "api:help_chat" or "api:convert_import".
   * Stored in `RateLimitTracker.provider`. Pick a unique string per endpoint;
   * collisions across endpoints would share the same counter.
   */
  bucket: string;
  /** Max requests allowed within `windowMs`. */
  maxRequests: number;
  /** Window length in ms. The window is bucketed (floored), not rolling. */
  windowMs: number;
}

export interface PersistentRateLimitResult {
  allowed: boolean;
  /** Seconds until the current bucket boundary closes; `0` when allowed. */
  retryAfterSec: number;
}

/**
 * Persistent per-user rate limiter backed by the `RateLimitTracker` Postgres
 * table. Survives process restarts and works across instances, unlike the
 * in-memory `Map`-based limiters previously used in /api/help/chat and
 * /api/convert/import (audit M-RATE-1).
 *
 * Implementation: bucketed window (floor(now / windowMs) * windowMs) so the
 * unique constraint `(user_id, provider, window_start)` makes the upsert
 * atomic. Denied requests still increment the counter; that's a deliberate
 * trade-off — preventing the increment would require SELECT FOR UPDATE inside
 * a transaction, which is more expensive and not worth it for a burst limiter.
 *
 * Fail-open on DB errors so a database hiccup doesn't take down user-facing
 * endpoints. Failures are logged at WARN.
 */
export async function checkPersistentRateLimit(
  opts: PersistentRateLimitOptions,
): Promise<PersistentRateLimitResult> {
  const now = Date.now();
  const bucketStartMs = Math.floor(now / opts.windowMs) * opts.windowMs;
  const windowStart = new Date(bucketStartMs);

  try {
    const tracker = await db.rateLimitTracker.upsert({
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
      update: {
        request_count: { increment: 1 },
      },
    });

    if (tracker.request_count > opts.maxRequests) {
      const retryAfterMs = bucketStartMs + opts.windowMs - now;
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return { allowed: false, retryAfterSec };
    }

    return { allowed: true, retryAfterSec: 0 };
  } catch (err) {
    log.warn(
      { err, userId: opts.userId, bucket: opts.bucket },
      "Persistent rate limit check failed — allowing request",
    );
    return { allowed: true, retryAfterSec: 0 };
  }
}

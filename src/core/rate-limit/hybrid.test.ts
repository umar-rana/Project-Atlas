import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();

vi.mock("@/core/db", () => ({
  db: { rateLimitTracker: { upsert: (...a: unknown[]) => mockUpsert(...a) } },
  newId: () => "mock-id",
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { checkHybridRateLimit, __testing } from "./hybrid";

beforeEach(() => {
  vi.clearAllMocks();
  __testing.reset();
  mockUpsert.mockResolvedValue({ request_count: 1 });
});

describe("checkHybridRateLimit", () => {
  it("allows the first request from in-memory state without awaiting the DB", async () => {
    const result = await checkHybridRateLimit({
      userId: "u1",
      bucket: "test",
      maxRequests: 5,
      windowMs: 60_000,
    });

    expect(result).toEqual({ allowed: true, retryAfterSec: 0 });
    // Background upsert is fire-and-forget; check it was scheduled.
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("allows up to maxRequests without falling through to the DB-confirmed path", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkHybridRateLimit({
        userId: "u1",
        bucket: "test",
        maxRequests: 5,
        windowMs: 60_000,
      });
      expect(r.allowed).toBe(true);
    }

    // 5 requests under cap: 5 fire-and-forget upserts. No additional confirmation queries.
    expect(mockUpsert).toHaveBeenCalledTimes(5);
  });

  it("falls through to checkPersistentRateLimit when the in-memory count exceeds the cap", async () => {
    // Burn through the cap. The 6th request triggers the authoritative check.
    // checkPersistentRateLimit also calls upsert, so by the 6th call we expect
    // 5 fire-and-forget + 1 confirmation = 6 upserts total.
    mockUpsert.mockResolvedValue({ request_count: 100 }); // far over cap

    for (let i = 0; i < 5; i++) {
      await checkHybridRateLimit({
        userId: "u1",
        bucket: "test",
        maxRequests: 5,
        windowMs: 60_000,
      });
    }

    // 6th — local says deny, falls through to DB authoritative.
    const result = await checkHybridRateLimit({
      userId: "u1",
      bucket: "test",
      maxRequests: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
    expect(mockUpsert).toHaveBeenCalledTimes(6);
  });

  it("trusts the DB when it disagrees with the in-memory count (multi-instance safety)", async () => {
    // Local says 6 of 5 → call should defer to DB. If DB says we're at 4
    // (because other instances haven't been busy), the user is allowed.
    mockUpsert.mockResolvedValue({ request_count: 4 });

    for (let i = 0; i < 5; i++) {
      await checkHybridRateLimit({
        userId: "u1",
        bucket: "test",
        maxRequests: 5,
        windowMs: 60_000,
      });
    }

    const result = await checkHybridRateLimit({
      userId: "u1",
      bucket: "test",
      maxRequests: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
  });

  it("isolates users — one user's bucket does not affect another's", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkHybridRateLimit({
        userId: "u1",
        bucket: "test",
        maxRequests: 5,
        windowMs: 60_000,
      });
      expect(r.allowed).toBe(true);
    }
    // u2 is fresh.
    const r = await checkHybridRateLimit({
      userId: "u2",
      bucket: "test",
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(r.allowed).toBe(true);
  });

  it("isolates buckets — different bucket per user has independent counters", async () => {
    for (let i = 0; i < 5; i++) {
      await checkHybridRateLimit({
        userId: "u1",
        bucket: "api:help_chat",
        maxRequests: 5,
        windowMs: 60_000,
      });
    }
    const r = await checkHybridRateLimit({
      userId: "u1",
      bucket: "api:convert_import",
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(r.allowed).toBe(true);
  });

  it("does not throw when the background persist upsert fails", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("DB transient"));

    const result = await checkHybridRateLimit({
      userId: "u1",
      bucket: "test",
      maxRequests: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
    // Allow the fire-and-forget rejection to settle so it doesn't leak.
    await new Promise((r) => setTimeout(r, 0));
  });

  it("resets the in-memory count when the window rolls over", async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);

    for (let i = 0; i < 5; i++) {
      await checkHybridRateLimit({
        userId: "u1",
        bucket: "test",
        maxRequests: 5,
        windowMs: 60_000,
      });
    }

    // Advance past the window boundary.
    vi.setSystemTime(t0 + 61_000);

    const peeked = __testing.peek("u1:test");
    // Old window still in cache but next call should rebucket and reset.
    expect(peeked).toBeDefined();

    const result = await checkHybridRateLimit({
      userId: "u1",
      bucket: "test",
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
    expect(__testing.peek("u1:test")?.count).toBe(1);

    vi.useRealTimers();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteMany = vi.fn();

vi.mock("@/core/db", () => ({
  db: { rateLimitTracker: { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) } },
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleRateLimitTrackerCleanup } from "./rate-limit-tracker-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

describe("handleRateLimitTrackerCleanup", () => {
  it("deletes rows with window_start older than 7 days", async () => {
    const before = Date.now();
    await handleRateLimitTrackerCleanup();
    const after = Date.now();

    expect(mockDeleteMany).toHaveBeenCalledOnce();
    const arg = mockDeleteMany.mock.calls[0]![0] as {
      where: { window_start: { lt: Date } };
    };

    const expectedMin = before - 7 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 7 * 24 * 60 * 60 * 1000;
    expect(arg.where.window_start.lt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(arg.where.window_start.lt.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("returns the count from deleteMany", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1234 });
    const result = await handleRateLimitTrackerCleanup();
    expect(result).toEqual({ deleted: 1234 });
  });

  it("propagates errors", async () => {
    mockDeleteMany.mockRejectedValue(new Error("DB unavailable"));
    await expect(handleRateLimitTrackerCleanup()).rejects.toThrow("DB unavailable");
  });
});

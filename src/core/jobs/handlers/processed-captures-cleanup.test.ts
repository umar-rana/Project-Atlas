import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteMany = vi.fn();

vi.mock("@/core/db", () => ({
  db: { capture: { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) } },
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleProcessedCapturesCleanup } from "./processed-captures-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

describe("handleProcessedCapturesCleanup", () => {
  it("deletes captures with state=processed older than 90 days", async () => {
    const before = Date.now();
    await handleProcessedCapturesCleanup();
    const after = Date.now();

    expect(mockDeleteMany).toHaveBeenCalledOnce();
    const arg = mockDeleteMany.mock.calls[0]![0] as {
      where: { state: string; processed_at: { lt: Date; not: null } };
    };
    expect(arg.where.state).toBe("processed");
    expect(arg.where.processed_at.not).toBeNull();

    const expectedMin = before - 90 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 90 * 24 * 60 * 60 * 1000;
    expect(arg.where.processed_at.lt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(arg.where.processed_at.lt.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("returns the count from deleteMany", async () => {
    mockDeleteMany.mockResolvedValue({ count: 42 });
    const result = await handleProcessedCapturesCleanup();
    expect(result).toEqual({ captures: 42 });
  });

  it("propagates errors (no catch in handler)", async () => {
    mockDeleteMany.mockRejectedValue(new Error("connection refused"));
    await expect(handleProcessedCapturesCleanup()).rejects.toThrow("connection refused");
  });
});

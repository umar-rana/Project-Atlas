import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/core/db", () => ({
  db: {
    auditLog: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
    },
  },
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleJobRecordsCleanup } from "./job-records-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

describe("handleJobRecordsCleanup", () => {
  it("does nothing when no jobs are recorded", async () => {
    mockFindMany.mockResolvedValueOnce([]); // distinct jobs query

    const result = await handleJobRecordsCleanup();

    expect(result.deleted).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("skips jobs with fewer than 100 entries (no anchor row)", async () => {
    mockFindMany
      .mockResolvedValueOnce([{ entity_id: "trash-retention" }]) // distinct
      .mockResolvedValueOnce([]); // anchor query — no 100th row

    const result = await handleJobRecordsCleanup();

    expect(result.deleted).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("prunes entries older than the 100th-most-recent for each job", async () => {
    const anchor = new Date("2026-04-01T00:00:00Z");
    mockFindMany
      .mockResolvedValueOnce([
        { entity_id: "trash-retention" },
        { entity_id: "drive-sync-notes" },
      ])
      .mockResolvedValueOnce([{ created_at: anchor }]) // trash anchor
      .mockResolvedValueOnce([{ created_at: anchor }]); // drive anchor
    mockDeleteMany.mockResolvedValueOnce({ count: 50 }).mockResolvedValueOnce({ count: 30 });

    const result = await handleJobRecordsCleanup();

    expect(result.deleted).toBe(80);
    expect(mockDeleteMany).toHaveBeenCalledTimes(2);
    const firstCall = mockDeleteMany.mock.calls[0]![0] as {
      where: { entity_id: string; created_at: { lt: Date }; action: { in: string[] } };
    };
    expect(firstCall.where.entity_id).toBe("trash-retention");
    expect(firstCall.where.created_at.lt).toEqual(anchor);
    expect(firstCall.where.action.in).toEqual([
      "job_run_completed",
      "job_paused",
      "job_resumed",
    ]);
  });

  it("uses skip=99 take=1 to find the 100th row", async () => {
    mockFindMany
      .mockResolvedValueOnce([{ entity_id: "trash-retention" }])
      .mockResolvedValueOnce([{ created_at: new Date() }]);

    await handleJobRecordsCleanup();

    const anchorCall = mockFindMany.mock.calls[1]![0] as {
      skip: number;
      take: number;
      orderBy: { created_at: string };
    };
    expect(anchorCall.skip).toBe(99);
    expect(anchorCall.take).toBe(1);
    expect(anchorCall.orderBy.created_at).toBe("desc");
  });

  it("isolates per-job failures — one job's error does not stop others", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { entity_id: "job-a" },
        { entity_id: "job-b" },
      ])
      .mockRejectedValueOnce(new Error("anchor query failed for job-a"))
      .mockResolvedValueOnce([{ created_at: new Date() }]);
    mockDeleteMany.mockResolvedValueOnce({ count: 5 });

    const result = await handleJobRecordsCleanup();

    expect(result.deleted).toBe(5); // job-b succeeded
    expect(mockDeleteMany).toHaveBeenCalledTimes(1); // only job-b's deleteMany ran
  });
});

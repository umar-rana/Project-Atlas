import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockStorageDelete = vi.fn();
const mockStorageList = vi.fn();

vi.mock("@/core/db", () => ({
  db: { attachment: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));

vi.mock("@/core/storage", () => ({
  storage: {
    delete: (...a: unknown[]) => mockStorageDelete(...a),
    list: (...a: unknown[]) => mockStorageList(...a),
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

import { handleAttachmentCleanup } from "./attachment-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  mockStorageList.mockResolvedValue([]);
  mockStorageDelete.mockResolvedValue(undefined);
});

describe("handleAttachmentCleanup", () => {
  it("uses a 48-hour grace period to find soft-deleted attachments", async () => {
    mockFindMany.mockResolvedValue([]);

    const before = Date.now();
    await handleAttachmentCleanup();
    const after = Date.now();

    const phase1Call = mockFindMany.mock.calls[0]![0] as {
      where: { deleted_at: { lt: Date; not: null } };
    };
    expect(phase1Call.where.deleted_at.not).toBeNull();
    const expectedMin = before - 48 * 60 * 60 * 1000;
    const expectedMax = after - 48 * 60 * 60 * 1000;
    expect(phase1Call.where.deleted_at.lt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(phase1Call.where.deleted_at.lt.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("deletes both storage_path and thumbnail_path when present", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "1", storage_path: "users/u/a.pdf", thumbnail_path: "users/u/a.thumb.png" },
      { id: "2", storage_path: "users/u/b.png", thumbnail_path: null },
    ]);

    const result = await handleAttachmentCleanup();

    expect(mockStorageDelete).toHaveBeenCalledWith("users/u/a.pdf");
    expect(mockStorageDelete).toHaveBeenCalledWith("users/u/a.thumb.png");
    expect(mockStorageDelete).toHaveBeenCalledWith("users/u/b.png");
    // 3 storage deletes for 2 attachments
    expect(mockStorageDelete).toHaveBeenCalledTimes(3);
    expect(result.attachments).toBe(2);
    expect(result.errors).toBe(0);
  });

  it("counts a storage failure as an error but continues to next attachment", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "1", storage_path: "users/u/a.pdf", thumbnail_path: null },
      { id: "2", storage_path: "users/u/b.png", thumbnail_path: null },
    ]);
    mockStorageDelete
      .mockRejectedValueOnce(new Error("R2 5xx"))
      .mockResolvedValueOnce(undefined);

    const result = await handleAttachmentCleanup();

    expect(result.attachments).toBe(1);
    expect(result.errors).toBe(1);
  });

  it("counts errors=1 if the soft-deleted query itself fails (skips phase 1)", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("DB unavailable"));
    // phase 2 still runs — return empty
    mockStorageList.mockResolvedValue([]);

    const result = await handleAttachmentCleanup();

    expect(result.attachments).toBe(0);
    expect(result.errors).toBe(1);
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it("phase 2: deletes orphan export/import keys not present in DB", async () => {
    mockFindMany.mockResolvedValueOnce([]); // phase 1 — no soft-deleted
    mockStorageList.mockResolvedValue([
      "users/u1/exports/a.pdf",
      "users/u1/imports/b.md",
      "users/u1/avatars/me.png", // not under exports/imports — ignored
      "users/u2/exports/orphan.pdf",
    ]);
    mockFindMany.mockResolvedValueOnce([
      { storage_path: "users/u1/exports/a.pdf" },
      { storage_path: "users/u1/imports/b.md" },
    ]); // phase 2 — known

    const result = await handleAttachmentCleanup();

    expect(mockStorageDelete).toHaveBeenCalledOnce();
    expect(mockStorageDelete).toHaveBeenCalledWith("users/u2/exports/orphan.pdf");
    expect(result.orphans).toBe(1);
    expect(result.attachments).toBe(0);
  });

  it("phase 2 failure does not raise — errors counter increments", async () => {
    mockFindMany.mockResolvedValueOnce([]); // phase 1
    mockStorageList.mockRejectedValue(new Error("R2 list 5xx"));

    const result = await handleAttachmentCleanup();

    expect(result.errors).toBe(1);
    expect(result.attachments).toBe(0);
    expect(result.orphans).toBe(0);
  });
});

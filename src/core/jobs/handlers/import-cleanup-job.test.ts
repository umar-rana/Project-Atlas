import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuditFindMany = vi.fn();
const mockStorageExists = vi.fn();
const mockStorageDelete = vi.fn();

vi.mock("@/core/db", () => ({
  db: { auditLog: { findMany: (...a: unknown[]) => mockAuditFindMany(...a) } },
}));

vi.mock("@/core/storage", () => ({
  storage: {
    exists: (...a: unknown[]) => mockStorageExists(...a),
    delete: (...a: unknown[]) => mockStorageDelete(...a),
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

import { handleImportCleanup } from "./import-cleanup-job";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleImportCleanup", () => {
  it("queries audit log for entries older than 24h with action=note_export_pdf", async () => {
    mockAuditFindMany.mockResolvedValue([]);

    const before = Date.now();
    await handleImportCleanup();
    const after = Date.now();

    expect(mockAuditFindMany).toHaveBeenCalledOnce();
    const arg = mockAuditFindMany.mock.calls[0]![0] as {
      where: { action: string; created_at: { lt: Date } };
    };
    expect(arg.where.action).toBe("note_export_pdf");
    const expectedMin = before - 24 * 60 * 60 * 1000;
    const expectedMax = after - 24 * 60 * 60 * 1000;
    expect(arg.where.created_at.lt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(arg.where.created_at.lt.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("deletes storage objects for expired exports when they exist", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "audit-1", meta: { storagePath: "users/u1/exports/a.pdf" } },
      { id: "audit-2", meta: { storagePath: "users/u1/exports/b.pdf" } },
    ]);
    mockStorageExists.mockResolvedValue(true);
    mockStorageDelete.mockResolvedValue(undefined);

    const result = await handleImportCleanup();

    expect(result).toEqual({ deleted: 2, errors: 0 });
    expect(mockStorageDelete).toHaveBeenCalledWith("users/u1/exports/a.pdf");
    expect(mockStorageDelete).toHaveBeenCalledWith("users/u1/exports/b.pdf");
  });

  it("counts existing-but-already-gone objects as deleted (idempotent)", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "audit-1", meta: { storagePath: "users/u1/exports/missing.pdf" } },
    ]);
    mockStorageExists.mockResolvedValue(false);

    const result = await handleImportCleanup();

    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 1, errors: 0 });
  });

  it("skips entries whose meta has no storagePath", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "audit-1", meta: null },
      { id: "audit-2", meta: { storagePath: "users/u1/exports/x.pdf" } },
      { id: "audit-3", meta: {} },
    ]);
    mockStorageExists.mockResolvedValue(true);
    mockStorageDelete.mockResolvedValue(undefined);

    const result = await handleImportCleanup();

    expect(mockStorageDelete).toHaveBeenCalledOnce();
    expect(result.deleted).toBe(1);
  });

  it("isolates storage delete failures — counts errors but continues", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "audit-1", meta: { storagePath: "users/u1/exports/a.pdf" } },
      { id: "audit-2", meta: { storagePath: "users/u1/exports/b.pdf" } },
    ]);
    mockStorageExists.mockResolvedValue(true);
    mockStorageDelete
      .mockRejectedValueOnce(new Error("R2 transient"))
      .mockResolvedValueOnce(undefined);

    const result = await handleImportCleanup();

    expect(result).toEqual({ deleted: 1, errors: 1 });
    expect(mockStorageDelete).toHaveBeenCalledTimes(2);
  });

  it("returns errors=1 if the audit log query itself fails", async () => {
    mockAuditFindMany.mockRejectedValue(new Error("DB down"));

    const result = await handleImportCleanup();

    expect(result).toEqual({ deleted: 0, errors: 1 });
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });
});

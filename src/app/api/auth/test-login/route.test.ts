import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const findUniqueMock = vi.fn();
const createUserMock = vi.fn();
const updateUserMock = vi.fn();
const getUserListMock = vi.fn();
const createClerkUserMock = vi.fn();
const createSignInTokenMock = vi.fn();

vi.mock("@/core/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createUserMock(...args),
      update: (...args: unknown[]) => updateUserMock(...args),
    },
  },
  newId: () => "test-user-id-0000000000000000",
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUserList: (...args: unknown[]) => getUserListMock(...args),
      createUser: (...args: unknown[]) => createClerkUserMock(...args),
    },
    signInTokens: {
      createSignInToken: (...args: unknown[]) => createSignInTokenMock(...args),
    },
  }),
}));

vi.mock("@/core/logging", () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

const VALID_SECRET = "a".repeat(40);
const MOCK_CLERK_USER_ID = "user_test_12345";

function buildRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:5000/api/auth/test-login", {
    method: "POST",
    headers,
  });
}

describe("POST /api/auth/test-login", () => {
  const originalSecret = process.env.E2E_AUTH_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.E2E_ALLOW_IN_PRODUCTION;

  beforeEach(() => {
    findUniqueMock.mockReset();
    createUserMock.mockReset();
    updateUserMock.mockReset();
    getUserListMock.mockReset();
    createClerkUserMock.mockReset();
    createSignInTokenMock.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.E2E_AUTH_SECRET;
    } else {
      process.env.E2E_AUTH_SECRET = originalSecret;
    }
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
    if (originalAllow === undefined) {
      delete process.env.E2E_ALLOW_IN_PRODUCTION;
    } else {
      process.env.E2E_ALLOW_IN_PRODUCTION = originalAllow;
    }
    vi.resetModules();
  });

  it("returns 404 when E2E_AUTH_SECRET is not set", async () => {
    delete process.env.E2E_AUTH_SECRET;
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }));
    expect(res.status).toBe(404);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("returns 404 when E2E_AUTH_SECRET is too short (< 32 chars)", async () => {
    process.env.E2E_AUTH_SECRET = "short-secret";
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ Authorization: "Bearer short-secret" }));
    expect(res.status).toBe(404);
  });

  it("returns 401 when the bearer token does not match", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: "Bearer wrong-secret-of-the-right-length-xxxxx" }),
    );
    expect(res.status).toBe(401);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("returns 404 in production even if E2E_AUTH_SECRET is set (without E2E_ALLOW_IN_PRODUCTION)", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.E2E_ALLOW_IN_PRODUCTION;
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }));
    expect(res.status).toBe(404);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with signInUrl on success for existing Clerk user", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();

    getUserListMock.mockResolvedValueOnce({
      totalCount: 1,
      data: [{ id: MOCK_CLERK_USER_ID }],
    });
    findUniqueMock.mockResolvedValueOnce({
      id: "existing-user-id",
      email: "e2e@atlas.test",
      name: "Atlas E2E",
      clerk_id: MOCK_CLERK_USER_ID,
    });
    createSignInTokenMock.mockResolvedValueOnce({ token: "test-sign-in-token" });

    const { POST } = await import("./route");
    const res = await POST(buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.signInUrl).toContain("__clerk_ticket=test-sign-in-token");
    expect(json.user.email).toBe("e2e@atlas.test");
    expect(createClerkUserMock).not.toHaveBeenCalled();
  });

  it("creates Clerk user and Prisma user on first call", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();

    getUserListMock.mockResolvedValueOnce({ totalCount: 0, data: [] });
    createClerkUserMock.mockResolvedValueOnce({ id: MOCK_CLERK_USER_ID });
    // No existing user in Prisma
    findUniqueMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce(null);
    createUserMock.mockResolvedValueOnce({
      id: "test-user-id-0000000000000000",
      email: "e2e@atlas.test",
      name: "Atlas E2E",
      clerk_id: MOCK_CLERK_USER_ID,
    });
    createSignInTokenMock.mockResolvedValueOnce({ token: "new-sign-in-token" });

    const { POST } = await import("./route");
    const res = await POST(buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }));
    expect(res.status).toBe(200);

    expect(createClerkUserMock).toHaveBeenCalledOnce();
    expect(createUserMock).toHaveBeenCalledOnce();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.signInUrl).toContain("__clerk_ticket=new-sign-in-token");
  });

  it("activates in production when E2E_ALLOW_IN_PRODUCTION=1 is also set (CI mode)", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.E2E_ALLOW_IN_PRODUCTION = "1";
    vi.resetModules();

    getUserListMock.mockResolvedValueOnce({
      totalCount: 1,
      data: [{ id: MOCK_CLERK_USER_ID }],
    });
    findUniqueMock.mockResolvedValueOnce({
      id: "existing-user-id",
      email: "e2e@atlas.test",
      clerk_id: MOCK_CLERK_USER_ID,
    });
    createSignInTokenMock.mockResolvedValueOnce({ token: "ci-token" });

    const { POST } = await import("./route");
    const res = await POST(buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }));
    expect(res.status).toBe(200);
    expect(createSignInTokenMock).toHaveBeenCalledOnce();
  });
});

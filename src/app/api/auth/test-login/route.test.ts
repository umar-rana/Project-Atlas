import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const findUniqueMock = vi.fn();
const createUserMock = vi.fn();
const createSessionMock = vi.fn();

vi.mock("@/core/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createUserMock(...args),
    },
  },
  newId: () => "test-user-id-0000000000000000",
}));

vi.mock("@/core/auth/session", () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
  SESSION_COOKIE_NAME: () => "atlas_session",
  SESSION_MAX_AGE: () => 7 * 24 * 60 * 60,
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
    createSessionMock.mockReset();
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
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
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
    const res = await POST(
      buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }),
    );
    expect(res.status).toBe(404);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when E2E_AUTH_SECRET is too short (< 32 chars)", async () => {
    process.env.E2E_AUTH_SECRET = "short-secret";
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: "Bearer short-secret" }),
    );
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token does not match", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: "Bearer wrong-secret-of-the-right-length-xxxxx" }),
    );
    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("returns 404 in production even if E2E_AUTH_SECRET is set (without E2E_ALLOW_IN_PRODUCTION)", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.E2E_ALLOW_IN_PRODUCTION;
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }),
    );
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("activates in production when E2E_ALLOW_IN_PRODUCTION=1 is also set (CI mode)", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.E2E_ALLOW_IN_PRODUCTION = "1";
    vi.resetModules();

    findUniqueMock.mockResolvedValueOnce({
      id: "existing-user-id",
      email: "e2e@atlas.test",
      name: "Atlas E2E",
    });
    createSessionMock.mockResolvedValueOnce("ci.signed.token");

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }),
    );
    expect(res.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledOnce();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("provisions the test user on first call and mints a session cookie", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();

    findUniqueMock.mockResolvedValueOnce(null);
    createUserMock.mockResolvedValueOnce({
      id: "test-user-id-0000000000000000",
      email: "e2e@atlas.test",
      name: "Atlas E2E",
    });
    createSessionMock.mockResolvedValueOnce("signed.session.token");

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }),
    );
    expect(res.status).toBe(200);

    expect(createUserMock).toHaveBeenCalledOnce();
    const createArgs = createUserMock.mock.calls[0]![0] as {
      data: { email: string; name: string };
    };
    expect(createArgs.data.email).toBe("e2e@atlas.test");

    expect(createSessionMock).toHaveBeenCalledOnce();

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.cookieName).toBe("atlas_session");
    expect(json.cookieValue).toBe("signed.session.token");
    expect(json.user.email).toBe("e2e@atlas.test");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("atlas_session=signed.session.token");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("reuses the existing test user on subsequent calls", async () => {
    process.env.E2E_AUTH_SECRET = VALID_SECRET;
    vi.resetModules();

    findUniqueMock.mockResolvedValueOnce({
      id: "existing-user-id",
      email: "e2e@atlas.test",
      name: "Atlas E2E",
    });
    createSessionMock.mockResolvedValueOnce("another.signed.token");

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ Authorization: `Bearer ${VALID_SECRET}` }),
    );
    expect(res.status).toBe(200);
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createSessionMock).toHaveBeenCalledWith(
      "existing-user-id",
      expect.any(Object),
    );
  });
});

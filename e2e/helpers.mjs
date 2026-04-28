// Shared helpers for Atlas e2e test scripts.
//
// Each test script imports these utilities instead of duplicating the auth /
// browser-launch boilerplate.
//
// Development setup
// -----------------
// E2E tests use a CI-only test-login endpoint that is gated by two env vars
// that must be present in BOTH the app server and the test runner process:
//
//   E2E_AUTH_SECRET   — a string of ≥32 chars shared between server and tests
//   E2E_ALLOW_IN_PRODUCTION — set to "1" when NODE_ENV=production (CI only)
//
// In CI these are set via .github/workflows/ci.yml.
// Locally, export them in your shell before starting the dev server and tests:
//
//   export E2E_AUTH_SECRET=ci-e2e-auth-secret-do-not-use-anywhere-else-1234567890abcdef
//   npm run dev &          # server picks up the var
//   APP_URL=http://localhost:5000 node e2e/task-complete.e2e.mjs

import { chromium } from "playwright-core";

export const APP_URL =
  process.env.APP_URL ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5000");

export const E2E_AUTH_SECRET = process.env.E2E_AUTH_SECRET;
export const SESSION_COOKIE = process.env.ATLAS_SESSION_COOKIE;
export const COOKIE_NAME_OVERRIDE = process.env.ATLAS_SESSION_COOKIE_NAME;

export const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  undefined;

export function assertCredentials() {
  if (!SESSION_COOKIE && !E2E_AUTH_SECRET) {
    console.error(
      "[e2e] Missing credentials. Set either E2E_AUTH_SECRET (CI mode) or " +
        "ATLAS_SESSION_COOKIE (manual mode).",
    );
    process.exit(2);
  }
}

export async function obtainSessionViaTestLogin(appUrl, secret) {
  const url = new URL("/api/auth/test-login", appUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "User-Agent": "atlas-e2e",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `test-login failed: ${res.status} ${res.statusText}` +
        (body ? ` — ${body.slice(0, 200)}` : ""),
    );
  }
  const json = await res.json();
  if (!json?.cookieName || !json?.cookieValue) {
    throw new Error("test-login returned no cookie payload");
  }
  return { name: json.cookieName, value: json.cookieValue };
}

/**
 * Resolve the session cookie name/value from env vars or the test-login
 * endpoint, then return a Playwright browser context pre-loaded with that
 * cookie.
 */
export async function createAuthenticatedContext(browser) {
  let cookieName = COOKIE_NAME_OVERRIDE ?? "atlas_session";
  let cookieValue = SESSION_COOKIE;

  if (E2E_AUTH_SECRET) {
    console.log(`[e2e] minting CI session via ${APP_URL}/api/auth/test-login`);
    const minted = await obtainSessionViaTestLogin(APP_URL, E2E_AUTH_SECRET);
    cookieName = COOKIE_NAME_OVERRIDE ?? minted.name;
    cookieValue = minted.value;
  }

  const url = new URL(APP_URL);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  return context;
}

export async function launchBrowser() {
  return chromium.launch({
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/**
 * Navigate to a page and assert we are not on the sign-in page.
 */
export async function navigateTo(page, path) {
  const target = `${APP_URL}${path}`;
  console.log(`[e2e] navigating to ${target}`);
  const resp = await page.goto(target, { waitUntil: "networkidle" });
  if (!resp || !resp.ok()) {
    throw new Error(
      `Navigation to ${path} failed: HTTP ${resp?.status() ?? "n/a"}`,
    );
  }
  if (page.url().includes("/sign-in")) {
    throw new Error(
      `Redirected to /sign-in — session cookie not accepted by the app.`,
    );
  }
}

/**
 * Run a single test scenario.  Handles browser lifecycle and exit code.
 * @param {string} name  Human-readable scenario name.
 * @param {(browser: import('playwright-core').Browser) => Promise<void>} fn
 */
export async function runScenario(name, fn) {
  assertCredentials();
  const browser = await launchBrowser();
  let exitCode = 0;
  try {
    await fn(browser);
    console.log(`[e2e] PASS — ${name}`);
  } catch (err) {
    console.error(
      `[e2e] FAIL — ${name} —`,
      err instanceof Error ? err.message : String(err),
    );
    exitCode = 1;
  } finally {
    await browser.close();
    process.exit(exitCode);
  }
}

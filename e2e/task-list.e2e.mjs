// Playwright e2e: happy-path "create task → open inspector → edit title →
// reload → confirm persistence".
//
// Authentication modes:
//
//   1. CI / automated mode (preferred) — set `E2E_AUTH_SECRET` to the same
//      value the server has configured. The script POSTs to
//      `/api/auth/test-login` with `Authorization: Bearer <secret>`. The
//      server returns a Clerk sign-in token URL; the browser navigates to it
//      and Clerk handles the session setup.
//
//   2. Local / manual mode — sign in via your browser and pass the Clerk
//      `__session` cookie value via `ATLAS_SESSION_COOKIE`.
//
// Examples:
//
//   # CI mode:
//   APP_URL=http://localhost:5000 \
//   E2E_AUTH_SECRET=<32+ char secret> \
//   node e2e/task-list.e2e.mjs
//
//   # Local mode:
//   APP_URL=https://<your-repl>.replit.dev \
//   ATLAS_SESSION_COOKIE=<__session cookie value> \
//   node e2e/task-list.e2e.mjs

import { chromium } from "playwright-core";

const APP_URL = process.env.APP_URL ?? process.env.REPLIT_DEV_DOMAIN
  ? (process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`)
  : "http://localhost:5000";
const SESSION_COOKIE = process.env.ATLAS_SESSION_COOKIE;
const E2E_AUTH_SECRET = process.env.E2E_AUTH_SECRET;
const CHROMIUM =
  process.env.CHROMIUM_PATH ||
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  undefined;

if (!SESSION_COOKIE && !E2E_AUTH_SECRET) {
  console.error(
    "[e2e] Missing credentials. Set either E2E_AUTH_SECRET (CI mode) or " +
      "ATLAS_SESSION_COOKIE (manual mode, copy __session cookie from browser).",
  );
  process.exit(2);
}

async function obtainSignInUrl(appUrl, secret) {
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
  if (!json?.signInUrl) {
    throw new Error("test-login returned no signInUrl");
  }
  return new URL(json.signInUrl, appUrl).toString();
}

const stamp = Date.now();
const ORIGINAL_TITLE = `e2e quick task ${stamp}`;
const EDITED_TITLE = `${ORIGINAL_TITLE} — edited`;

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let exitCode = 0;
try {
  const url = new URL(APP_URL);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  page.on("pageerror", (e) => {
    console.error(`[e2e] pageerror: ${e.message}`);
  });

  if (E2E_AUTH_SECRET) {
    console.log(`[e2e] obtaining Clerk sign-in token from ${APP_URL}/api/auth/test-login`);
    const signInUrl = await obtainSignInUrl(APP_URL, E2E_AUTH_SECRET);
    console.log(`[e2e] navigating to sign-in token URL`);
    await page.goto(signInUrl, { waitUntil: "networkidle" });
    // Wait for Clerk to process the ticket and redirect to /tasks
    await page.waitForURL((u) => !u.includes("/sign-in"), { timeout: 15_000 });
  } else {
    // Manual mode: inject the __session cookie directly
    await context.addCookies([
      {
        name: "__session",
        value: SESSION_COOKIE,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  }

  console.log(`[e2e] navigating to ${APP_URL}/tasks/inbox`);
  const resp = await page.goto(`${APP_URL}/tasks/inbox`, {
    waitUntil: "networkidle",
  });
  if (!resp || !resp.ok()) {
    throw new Error(
      `Initial navigation failed: status ${resp?.status() ?? "n/a"}. ` +
        `If you were redirected to /sign-in, your session is invalid or expired.`,
    );
  }
  if (page.url().includes("/sign-in")) {
    throw new Error(
      "Redirected to /sign-in — session not accepted by the app.",
    );
  }

  console.log(`[e2e] creating task: ${ORIGINAL_TITLE}`);
  const quickAdd = page.locator("input[placeholder*='Add a task' i], input[placeholder*='Add task' i], input[placeholder*='quick' i]").first();
  await quickAdd.waitFor({ state: "visible", timeout: 10_000 });
  await quickAdd.click();
  await quickAdd.fill(ORIGINAL_TITLE);
  await quickAdd.press("Enter");

  console.log("[e2e] waiting for the new row to appear");
  const row = page.locator(`[role='row']`, { hasText: ORIGINAL_TITLE });
  await row.first().waitFor({ state: "visible", timeout: 10_000 });
  await row.first().click();

  console.log("[e2e] opening inspector and editing title");
  const inspectorTitle = page
    .locator("aside textarea")
    .filter({ hasText: ORIGINAL_TITLE })
    .first();
  await inspectorTitle.waitFor({ state: "visible", timeout: 10_000 });
  await inspectorTitle.click();
  await inspectorTitle.fill(EDITED_TITLE);
  await inspectorTitle.blur();

  // Give the mutation a beat to flush before we reload.
  await page.waitForTimeout(1500);

  console.log("[e2e] reloading and verifying persistence");
  await page.reload({ waitUntil: "networkidle" });
  const editedRow = page.locator(`[role='row']`, { hasText: EDITED_TITLE });
  await editedRow.first().waitFor({ state: "visible", timeout: 10_000 });

  console.log("[e2e] PASS — edited title persisted across reload");
} catch (err) {
  console.error("[e2e] FAIL —", err instanceof Error ? err.message : String(err));
  exitCode = 1;
} finally {
  await browser.close();
  process.exit(exitCode);
}

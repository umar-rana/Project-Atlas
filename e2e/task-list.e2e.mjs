// Playwright e2e: happy-path "create task → open inspector → edit title →
// reload → confirm persistence".
//
// This script uses `playwright-core` (already a devDependency) so we don't
// need to install the full `@playwright/test` runner. Run it manually with:
//
//   APP_URL=https://<your-repl>.replit.dev \
//   ATLAS_SESSION_COOKIE=<value of the `atlas_session` cookie> \
//   node e2e/task-list.e2e.mjs
//
// The session cookie is required because the app is gated behind Replit
// OIDC; copy it out of your browser devtools after logging in. Failures
// exit with code 1 so this can be wired into CI later.
//
// What it does:
//   1. Visits /tasks/inbox.
//   2. Types a unique title into the quick-add input and presses Enter.
//   3. Waits for the new row to appear, clicks it to open the inspector.
//   4. Edits the title in the inspector and blurs to commit.
//   5. Reloads the page.
//   6. Asserts the new title is still present.

import { chromium } from "playwright-core";

const APP_URL = process.env.APP_URL ?? process.env.REPLIT_DEV_DOMAIN
  ? (process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`)
  : "http://localhost:5000";
const SESSION_COOKIE = process.env.ATLAS_SESSION_COOKIE;
const COOKIE_NAME = process.env.ATLAS_SESSION_COOKIE_NAME ?? "atlas_session";
const CHROMIUM =
  process.env.CHROMIUM_PATH ||
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  undefined;

if (!SESSION_COOKIE) {
  console.error(
    "[e2e] Missing ATLAS_SESSION_COOKIE env var. Sign in to the app in a browser, copy the value of the `atlas_session` cookie, and re-run with ATLAS_SESSION_COOKIE=<value>.",
  );
  process.exit(2);
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
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: SESSION_COOKIE,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  page.on("pageerror", (e) => {
    console.error(`[e2e] pageerror: ${e.message}`);
  });

  console.log(`[e2e] navigating to ${APP_URL}/tasks/inbox`);
  const resp = await page.goto(`${APP_URL}/tasks/inbox`, {
    waitUntil: "networkidle",
  });
  if (!resp || !resp.ok()) {
    throw new Error(
      `Initial navigation failed: status ${resp?.status() ?? "n/a"}. ` +
        `If you were redirected to /sign-in, your session cookie is invalid or expired.`,
    );
  }
  if (page.url().includes("/sign-in")) {
    throw new Error(
      "Redirected to /sign-in — session cookie not accepted by the app.",
    );
  }

  console.log(`[e2e] creating task: ${ORIGINAL_TITLE}`);
  const quickAdd = page.locator("input[placeholder*='Add task' i], input[placeholder*='quick' i]").first();
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

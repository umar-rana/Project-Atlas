// e2e: Quick-capture modal flow.
//
// 1. Navigate to /tasks/inbox.
// 2. Click the quick-capture button in the top bar.
// 3. The "Quick capture" dialog opens.
// 4. Type a unique plain-text task title into the textarea.
// 5. Click the "Capture" button.
// 6. The dialog closes and the new task appears in the inbox list.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

const stamp = Date.now();
const TASK_TITLE = `e2e quick-capture ${stamp}`;

await runScenario("quick-capture", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[e2e] pageerror: ${e.message}`));

  // ── Step 1: navigate to inbox ──────────────────────────────────────────────
  await navigateTo(page, "/tasks/inbox");

  // ── Step 2: open capture modal ────────────────────────────────────────────
  console.log("[e2e] opening quick-capture modal");
  const captureBtn = page.locator('[aria-label="Quick capture (⌘⇧I)"]').first();
  await captureBtn.waitFor({ state: "visible", timeout: 10_000 });
  await captureBtn.click();

  // ── Step 3: verify dialog is open ─────────────────────────────────────────
  const dialogTitle = page.getByText("Quick capture", { exact: true }).first();
  await dialogTitle.waitFor({ state: "visible", timeout: 5_000 });

  // ── Step 4: type a task title ──────────────────────────────────────────────
  console.log(`[e2e] typing task title: "${TASK_TITLE}"`);
  const textarea = page
    .locator('textarea[placeholder*="What\'s on your mind"]')
    .first();
  await textarea.waitFor({ state: "visible", timeout: 5_000 });
  await textarea.fill(TASK_TITLE);

  // ── Step 5: click Capture ─────────────────────────────────────────────────
  console.log("[e2e] submitting capture");
  const captureSubmit = page.getByRole("button", { name: /^Capture$/i }).first();
  await captureSubmit.click();

  // Wait for the dialog to close (indicates the mutation succeeded).
  await dialogTitle.waitFor({ state: "hidden", timeout: 10_000 });

  // ── Step 6: confirm task appears in inbox ──────────────────────────────────
  console.log("[e2e] confirming task appears in inbox");
  const newRow = page.locator("[role='row']", { hasText: TASK_TITLE }).first();
  await newRow.waitFor({ state: "visible", timeout: 10_000 });
});

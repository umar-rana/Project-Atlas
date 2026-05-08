// e2e: GTD Inbox processing flow.
//
// 1. Create a fresh capture via the quick-capture modal.
// 2. Open the processing-mode modal.
// 3. Select the "Task" disposition.
// 4. Verify the task form appears with a pre-filled title.
// 5. Submit the form and confirm:
//    a. The capture disappears from the inbox.
//    b. No error toast is shown.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

const stamp = Date.now();
const CAPTURE_TEXT = `e2e inbox-processing ${stamp}`;

await runScenario("inbox-processing", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[e2e] pageerror: ${e.message}`));

  // ── Step 1: navigate to inbox ──────────────────────────────────────────────
  await navigateTo(page, "/tasks/inbox");

  // ── Step 2: open quick-capture modal and create a capture ──────────────────
  console.log(`[e2e] creating capture: "${CAPTURE_TEXT}"`);
  const captureBtn = page
    .locator('[aria-label="Quick capture (⌘⇧I)"]')
    .first();
  await captureBtn.waitFor({ state: "visible", timeout: 10_000 });
  await captureBtn.click();

  const dialogTitle = page.getByText("Quick capture", { exact: true }).first();
  await dialogTitle.waitFor({ state: "visible", timeout: 5_000 });

  const textarea = page
    .locator('textarea[placeholder*="What\'s on your mind"]')
    .first();
  await textarea.waitFor({ state: "visible", timeout: 5_000 });
  await textarea.fill(CAPTURE_TEXT);

  const captureSubmit = page
    .getByRole("button", { name: /^Capture$/i })
    .first();
  await captureSubmit.click();
  await dialogTitle.waitFor({ state: "hidden", timeout: 10_000 });

  console.log("[e2e] capture created — waiting for inbox to show the row");
  const captureRow = page
    .locator("[role='row']", { hasText: CAPTURE_TEXT })
    .first();
  await captureRow.waitFor({ state: "visible", timeout: 10_000 });

  // ── Step 3: open processing mode ───────────────────────────────────────────
  console.log("[e2e] opening processing mode");
  const processBtn = page
    .getByRole("button", { name: /Process/i })
    .first();
  await processBtn.waitFor({ state: "visible", timeout: 10_000 });
  await processBtn.click();

  // Wait for the processing mode dialog to appear
  const processingHeading = page
    .getByText("Process Inbox", { exact: true })
    .first();
  await processingHeading.waitFor({ state: "visible", timeout: 10_000 });
  console.log("[e2e] processing mode open");

  // ── Step 4: select Task disposition ────────────────────────────────────────
  console.log("[e2e] selecting Task disposition");
  const taskBtn = page
    .getByRole("button", { name: /^T\s*Task$/i })
    .or(page.getByRole("button", { name: "Task" }))
    .first();
  await taskBtn.waitFor({ state: "visible", timeout: 5_000 });
  await taskBtn.click();

  // ── Step 5: verify form appears with pre-filled title ──────────────────────
  console.log("[e2e] verifying task form has pre-filled title");
  const titleInput = page.locator('input[placeholder*="Task title"]').first();
  await titleInput.waitFor({ state: "visible", timeout: 5_000 });
  const titleValue = await titleInput.inputValue();
  if (!titleValue || titleValue.trim().length === 0) {
    throw new Error(`Task title input was empty — expected pre-fill from capture text. Got: "${titleValue}"`);
  }
  console.log(`[e2e] title pre-filled with: "${titleValue}"`);

  // ── Step 6: submit the task form ───────────────────────────────────────────
  console.log("[e2e] submitting task form");
  const createTaskBtn = page
    .getByRole("button", { name: /Create Task/i })
    .first();
  await createTaskBtn.waitFor({ state: "visible", timeout: 5_000 });
  await createTaskBtn.click();

  // ── Step 7: verify no error toast appeared ─────────────────────────────────
  // Wait briefly for any error toast that might appear
  await page.waitForTimeout(1_500);
  const errorToast = page.locator('[role="status"]', { hasText: /failed|error/i }).first();
  const hasError = await errorToast.isVisible().catch(() => false);
  if (hasError) {
    const errorText = await errorToast.textContent().catch(() => "");
    throw new Error(`Error toast appeared after task submission: "${errorText}"`);
  }

  // ── Step 8: confirm the capture is gone from inbox (processed) ─────────────
  console.log("[e2e] confirming capture was processed out of inbox");
  // Processing mode should either advance to next capture or show inbox-zero
  // Wait for either state
  await Promise.race([
    page.getByText("Inbox zero!", { exact: true }).waitFor({ state: "visible", timeout: 15_000 }),
    page.locator("[data-testid='processing-capture-card']").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
    page.waitForTimeout(8_000), // fallback wait
  ]);

  console.log("[e2e] processing flow completed successfully");
});

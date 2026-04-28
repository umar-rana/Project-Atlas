// e2e: Task completion flow.
//
// 1. Navigate to /tasks/inbox.
// 2. Create a task via the quick-add bar.
// 3. Read the actual rendered title from the row (AI may have modified it).
// 4. Click the completion checkbox on the new row.
// 5. Wait for the row to leave the inbox list (confirms the mutation succeeded).
// 6. Navigate to /tasks/completed.
// 7. Wait for the tRPC response and confirm the task appears in the completed list.

import { runScenario, createAuthenticatedContext, navigateTo, APP_URL } from "./helpers.mjs";

const stamp = Date.now();
const INPUT_TITLE = `e2e-complete-${stamp}`;

await runScenario("task-complete", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    if (!e.message.includes("Hydration failed")) {
      console.error(`[e2e] pageerror: ${e.message}`);
    }
  });

  await navigateTo(page, "/tasks/inbox");

  // ── Create the task ────────────────────────────────────────────────────────
  console.log(`[e2e] creating task with input: "${INPUT_TITLE}"`);
  const quickAdd = page
    .locator(
      "input[placeholder*='Add a task' i], input[placeholder*='Add task' i], input[placeholder*='quick' i]",
    )
    .first();
  await quickAdd.waitFor({ state: "visible", timeout: 10_000 });
  await quickAdd.click();
  await quickAdd.fill(INPUT_TITLE);
  await quickAdd.press("Enter");

  // Wait for the row to appear.  The task title may differ from our input if
  // the AI parser rewrites it, so we read the actual rendered text.
  console.log("[e2e] waiting for task row");
  // We rely on the data-task-id attribute rendered on every row; after adding
  // a task the newest row appears at the top.  We find it by waiting for a
  // row that contains our stamp, which the AI is unlikely to drop entirely.
  const row = page.locator("[role='row']", { hasText: String(stamp) }).first();
  await row.waitFor({ state: "visible", timeout: 15_000 });

  const renderedTitle = await row.locator(".truncate").first().textContent();
  console.log(`[e2e] rendered title: "${renderedTitle}"`);

  // ── Complete the task ──────────────────────────────────────────────────────
  console.log("[e2e] clicking completion checkbox");
  const checkbox = row.locator('[aria-label="Mark task complete"]').first();
  await checkbox.waitFor({ state: "visible", timeout: 5_000 });
  await checkbox.click();

  // Inbox hides completed tasks — wait for the row to be removed.
  console.log("[e2e] waiting for row to leave inbox");
  await row.waitFor({ state: "hidden", timeout: 8_000 });
  await page.waitForTimeout(300);

  // ── Navigate to completed view ─────────────────────────────────────────────
  // Register the response waiter BEFORE navigating so we cannot miss it.
  const completedResponseP = page.waitForResponse(
    (r) => r.url().includes("tasks.completed") && r.status() === 200,
    { timeout: 15_000 },
  );
  await page.goto(`${APP_URL}/tasks/completed`, { waitUntil: "domcontentloaded" });

  console.log("[e2e] waiting for tasks.completed tRPC response");
  await completedResponseP;

  // Allow React one render cycle to paint the received data.
  await page.waitForTimeout(500);

  // ── Verify the task is shown ───────────────────────────────────────────────
  console.log("[e2e] confirming task appears in completed list");
  // Use the actual rendered title (or stamp as fallback) to locate the entry.
  const titleToFind = renderedTitle?.trim() || String(stamp);
  const completedEntry = page.locator(`text=${titleToFind}`).first();
  await completedEntry.waitFor({ state: "visible", timeout: 10_000 });
});

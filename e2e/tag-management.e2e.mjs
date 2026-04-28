// e2e: Tag creation and sidebar navigation.
//
// This test covers the full tag lifecycle from creation through the sidebar:
//
// The Tags section of the sidebar navigation lists tags that exist in the
// account. There is no standalone "Add tag" button in the sidebar; tags are
// created by typing into the inspector's "#add tag" field when editing a task
// (the inspector is part of the tasks sidebar panel). Once created, the tag
// link appears in the left nav sidebar under "Tags".
//
// Scenario:
//   1. Navigate to /tasks/inbox.
//   2. Create a task via the quick-add bar.
//   3. Click the task row to open the task inspector.
//   4. Type a unique tag name into the "#add tag" input and press Enter.
//   5. Verify the tag chip appears in the inspector's tag section.
//   6. Verify the new tag link appears in the left nav sidebar under "Tags".
//   7. Click the tag link in the sidebar to navigate to the tag's task list.
//   8. Confirm the task appears on the tag's task list page.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

const stamp = Date.now();
const TASK_TITLE = `e2e-tag-task-${stamp}`;
const TAG_NAME = `e2etag${stamp}`;

await runScenario("tag-management", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    if (!e.message.includes("Hydration failed")) {
      console.error(`[e2e] pageerror: ${e.message}`);
    }
  });

  await navigateTo(page, "/tasks/inbox");

  // ── Create a task ──────────────────────────────────────────────────────────
  console.log(`[e2e] creating task: "${TASK_TITLE}"`);
  const quickAdd = page
    .locator(
      "input[placeholder*='Add a task' i], input[placeholder*='Add task' i], input[placeholder*='quick' i]",
    )
    .first();
  await quickAdd.waitFor({ state: "visible", timeout: 10_000 });
  await quickAdd.click();
  await quickAdd.fill(TASK_TITLE);
  await quickAdd.press("Enter");

  // ── Open the inspector by clicking the task row ────────────────────────────
  console.log("[e2e] waiting for task row to appear");
  const row = page.locator("[role='row']", { hasText: String(stamp) }).first();
  await row.waitFor({ state: "visible", timeout: 15_000 });
  await row.click();

  // ── Add a new tag via the inspector tag input ──────────────────────────────
  // The inspector (the right-side task details panel) contains a "#add tag"
  // input. Typing a name and pressing Enter creates the tag and assigns it.
  console.log(`[e2e] adding tag "${TAG_NAME}" via inspector`);
  const tagInput = page
    .locator("aside input[placeholder*='add tag' i]")
    .first();
  await tagInput.waitFor({ state: "visible", timeout: 10_000 });
  await tagInput.click();
  await tagInput.fill(TAG_NAME);
  await tagInput.press("Enter");

  // The tag chip should now appear in the inspector.
  console.log("[e2e] confirming tag chip appears in inspector");
  const tagChip = page.locator("aside").getByText(`#${TAG_NAME}`, { exact: false }).first();
  await tagChip.waitFor({ state: "visible", timeout: 10_000 });

  // ── Verify the tag link appears in the left nav sidebar ───────────────────
  // The sidebar (left nav, aria-label "Task perspectives") lists every tag
  // as a link under the "Tags" section heading. Give the tRPC invalidation
  // a moment to propagate before asserting visibility.
  console.log("[e2e] confirming tag link appears in sidebar navigation");
  const sidebarTag = page
    .locator("nav[aria-label='Task perspectives']")
    .getByText(`#${TAG_NAME}`, { exact: false })
    .first();
  await sidebarTag.waitFor({ state: "visible", timeout: 15_000 });

  // ── Click the sidebar tag link and verify the task appears ─────────────────
  // Clicking the tag link navigates to /tasks/tags/<name> which shows all
  // tasks that carry this tag. The task we just created should be listed.
  console.log(`[e2e] clicking sidebar tag link to navigate to tag view`);
  await sidebarTag.click();
  await page.waitForURL(`**/tasks/tags/**`, { timeout: 10_000 });

  console.log("[e2e] confirming task appears in tag view");
  const taskInTagView = page
    .locator("[role='row']", { hasText: String(stamp) })
    .first();
  await taskInTagView.waitFor({ state: "visible", timeout: 15_000 });

  console.log(`[e2e] tag "${TAG_NAME}" is navigable via sidebar and shows the tagged task`);
});

// e2e: Task inspector — assign project and tag, then verify persistence.
//
// Scenario: Inspector edits survive a page reload
//   1. Navigate to /tasks/inbox.
//   2. Create a project via the sidebar "Add projects" button.
//   3. Create a task via the quick-add bar.
//   4. Click the task row to open the inspector.
//   5. Assign the new project via the Project <select>.
//   6. Add a unique tag via the "#add tag" input.
//   7. Wait for mutations to settle.
//   8. Click the project link in the sidebar to navigate to the project view.
//   9. Reload the page.
//  10. Click the task row again to reopen the inspector.
//  11. Confirm the project is still selected and the tag chip is still shown.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

const stamp = Date.now();
const PROJECT_NAME = `e2e-insp-proj-${stamp}`;
const TASK_TITLE = `e2e-insp-task-${stamp}`;
const TAG_NAME = `e2einsp${stamp}`;

await runScenario("task-inspector-edits", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    if (!e.message.includes("Hydration failed")) {
      console.error(`[e2e] pageerror: ${e.message}`);
    }
  });

  await navigateTo(page, "/tasks/inbox");

  // ── Create a project via the sidebar ──────────────────────────────────────
  console.log(`[e2e] creating project: "${PROJECT_NAME}"`);
  const addProjectBtn = page.locator('[aria-label="Add projects"]').first();
  await addProjectBtn.waitFor({ state: "visible", timeout: 10_000 });
  await addProjectBtn.click();

  const projectInput = page
    .locator('input[placeholder="Project title"]')
    .first();
  await projectInput.waitFor({ state: "visible", timeout: 5_000 });
  await projectInput.fill(PROJECT_NAME);

  const createProjectBtn = page.getByRole("button", { name: /^Create$/i }).first();
  await createProjectBtn.waitFor({ state: "visible", timeout: 3_000 });
  await createProjectBtn.click();

  // Wait for the project link to appear in the sidebar before continuing.
  const projectLink = page
    .locator("nav")
    .getByText(PROJECT_NAME, { exact: false })
    .first();
  await projectLink.waitFor({ state: "visible", timeout: 10_000 });

  // ── Create a task in the inbox ─────────────────────────────────────────────
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

  // Wait for the inspector to load (title textarea becomes visible).
  const inspectorTitle = page.locator("aside textarea").first();
  await inspectorTitle.waitFor({ state: "visible", timeout: 10_000 });

  // ── Assign the project ─────────────────────────────────────────────────────
  console.log(`[e2e] assigning project "${PROJECT_NAME}" in inspector`);
  const projectSelect = page.locator("aside select").first();
  await projectSelect.waitFor({ state: "visible", timeout: 5_000 });
  await projectSelect.selectOption({ label: PROJECT_NAME });

  // ── Add a tag ─────────────────────────────────────────────────────────────
  console.log(`[e2e] adding tag: "${TAG_NAME}"`);
  const tagInput = page
    .locator("aside input[placeholder*='add tag' i]")
    .first();
  await tagInput.waitFor({ state: "visible", timeout: 5_000 });
  await tagInput.click();
  await tagInput.fill(TAG_NAME);
  await tagInput.press("Enter");

  // The tag chip should appear immediately.
  const tagChip = page.locator("aside").getByText(`#${TAG_NAME}`, { exact: false }).first();
  await tagChip.waitFor({ state: "visible", timeout: 10_000 });

  // Wait for the tag mutation to be acknowledged by the server before
  // navigating away.  The tag assignment calls tasks.update, so we watch
  // for the response on that tRPC batch endpoint.
  console.log("[e2e] waiting for tag mutation to settle");
  await page.waitForResponse(
    (r) => r.url().includes("tasks.update") && r.status() === 200,
    { timeout: 15_000 },
  ).catch(() => {
    // tasks.update may be batched with other calls; if the specific URL
    // is not matched, fall back to a short fixed wait.
    return page.waitForTimeout(1500);
  });

  // ── Navigate to the project view (task was moved out of inbox) ─────────────
  // Assigning a project removes the task from inbox, so navigate to the project.
  console.log("[e2e] navigating to project view via sidebar");
  const projectSidebarLink = page
    .locator("nav")
    .getByText(PROJECT_NAME, { exact: false })
    .first();
  await projectSidebarLink.waitFor({ state: "visible", timeout: 5_000 });
  await projectSidebarLink.click();

  // Wait for the task to appear in the project view.
  const rowInProject = page
    .locator("[role='row']", { hasText: String(stamp) })
    .first();
  await rowInProject.waitFor({ state: "visible", timeout: 15_000 });

  // ── Reload and re-open the task ───────────────────────────────────────────
  console.log("[e2e] reloading page");
  await page.reload({ waitUntil: "networkidle" });

  const rowAfterReload = page
    .locator("[role='row']", { hasText: String(stamp) })
    .first();
  await rowAfterReload.waitFor({ state: "visible", timeout: 15_000 });
  await rowAfterReload.click();

  const inspectorAfterReload = page.locator("aside textarea").first();
  await inspectorAfterReload.waitFor({ state: "visible", timeout: 10_000 });

  // ── Verify project assignment persisted ────────────────────────────────────
  console.log("[e2e] verifying project assignment persisted");
  const projectSelectAfterReload = page.locator("aside select").first();
  await projectSelectAfterReload.waitFor({ state: "visible", timeout: 5_000 });
  const selectedProjectLabel = await projectSelectAfterReload.evaluate((el) => {
    const selected = el.options[el.selectedIndex];
    return selected ? selected.text : "";
  });
  if (!selectedProjectLabel.includes(PROJECT_NAME)) {
    throw new Error(
      `Expected project "${PROJECT_NAME}" to be selected, but got "${selectedProjectLabel}"`,
    );
  }

  // ── Verify tag assignment persisted ───────────────────────────────────────
  console.log("[e2e] verifying tag assignment persisted");
  const tagChipAfterReload = page
    .locator("aside")
    .getByText(`#${TAG_NAME}`, { exact: false })
    .first();
  await tagChipAfterReload.waitFor({ state: "visible", timeout: 10_000 });

  console.log("[e2e] project and tag assignments persisted across reload");
});

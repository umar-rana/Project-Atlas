// e2e: Project and context creation via the sidebar.
//
// Scenario A – Project creation:
//   1. Navigate to /tasks/inbox.
//   2. Click the "Add projects" (+) button in the sidebar.
//   3. Fill in a unique project name and submit.
//   4. The new project link appears in the sidebar.
//
// Scenario B – Context creation:
//   1. Click the "Add contexts" (+) button in the sidebar.
//   2. Fill in a unique context name and submit.
//   3. The new context link appears in the sidebar.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

const stamp = Date.now();
const PROJECT_NAME = `e2e-proj-${stamp}`;
const CONTEXT_NAME = `e2e-ctx-${stamp}`;

await runScenario("project-and-context-creation", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    if (!e.message.includes("Hydration failed")) {
      console.error(`[e2e] pageerror: ${e.message}`);
    }
  });

  await navigateTo(page, "/tasks/inbox");

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario A: create a project
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`[e2e] creating project: "${PROJECT_NAME}"`);

  // The SectionHeader renders an Add button with aria-label "Add <section>"
  // where the section name is lower-cased.  For the Projects section this is
  // "Add projects" (plural).
  const addProjectBtn = page.locator('[aria-label="Add projects"]').first();
  await addProjectBtn.waitFor({ state: "visible", timeout: 10_000 });
  await addProjectBtn.click();

  const projectInput = page
    .locator('input[placeholder="Project title"]')
    .first();
  await projectInput.waitFor({ state: "visible", timeout: 5_000 });
  await projectInput.fill(PROJECT_NAME);

  // Submit via button (not Enter — Enter might not submit the form here).
  const createProjectBtn = page.getByRole("button", { name: /^Create$/i }).first();
  await createProjectBtn.waitFor({ state: "visible", timeout: 3_000 });
  await createProjectBtn.click();

  // The new project should appear in the sidebar navigation.
  console.log("[e2e] confirming project appears in sidebar");
  const projectLink = page.locator("nav").getByText(PROJECT_NAME, { exact: false }).first();
  await projectLink.waitFor({ state: "visible", timeout: 10_000 });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario B: create a context
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`[e2e] creating context: "${CONTEXT_NAME}"`);

  const addContextBtn = page.locator('[aria-label="Add contexts"]').first();
  await addContextBtn.waitFor({ state: "visible", timeout: 10_000 });
  await addContextBtn.click();

  const contextInput = page
    .locator('input[placeholder="Context name (e.g. Home)"]')
    .first();
  await contextInput.waitFor({ state: "visible", timeout: 5_000 });
  await contextInput.fill(CONTEXT_NAME);

  const createContextBtn = page.getByRole("button", { name: /^Create$/i }).first();
  await createContextBtn.waitFor({ state: "visible", timeout: 3_000 });
  await createContextBtn.click();

  // The new context should appear in the sidebar navigation.
  console.log("[e2e] confirming context appears in sidebar");
  const contextLink = page.locator("nav").getByText(CONTEXT_NAME, { exact: false }).first();
  await contextLink.waitFor({ state: "visible", timeout: 10_000 });
});

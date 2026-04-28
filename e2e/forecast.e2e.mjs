// e2e: Forecast view — date columns rendered correctly.
//
// 1. Navigate to /tasks/forecast.
// 2. Confirm the "Forecast" heading is visible (view loaded, not redirected).
// 3. Wait for the day-columns grid to appear and confirm ≥3 day columns.
// 4. Confirm today's column is highlighted within that grid.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

await runScenario("forecast-view", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[e2e] pageerror: ${e.message}`));

  // ── Step 1: navigate to forecast ──────────────────────────────────────────
  await navigateTo(page, "/tasks/forecast");

  // ── Step 2: confirm the Forecast heading is visible ───────────────────────
  const heading = page.getByRole("heading", { name: "Forecast", exact: true });
  await heading.waitFor({ state: "visible", timeout: 10_000 });
  console.log("[e2e] Forecast heading visible");

  // ── Step 3: wait for the day-column grid to load ──────────────────────────
  // The grid has data-testid="forecast-day-grid"; children are DayColumn divs.
  const grid = page.locator('[data-testid="forecast-day-grid"]');
  await grid.waitFor({ state: "visible", timeout: 15_000 });

  // Each DayColumn is a direct flex child div with rounded-md border.
  // p.tracking-caps inside the grid holds the abbreviated day name ("Mon", "Tue" …).
  // Scope to the grid so sidebar / inspector tracking-caps elements are excluded.
  const dayHeaders = grid.locator("p.tracking-caps");
  await dayHeaders.first().waitFor({ state: "visible", timeout: 10_000 });

  const count = await dayHeaders.count();
  console.log(`[e2e] found ${count} day-column headers in forecast grid`);
  if (count < 3) {
    throw new Error(
      `Expected at least 3 day columns in forecast grid but found ${count}`,
    );
  }

  // ── Step 4: confirm today's column is highlighted ─────────────────────────
  // Today's DayColumn wrapper gets border-accent-primary; scoped to the grid.
  const todayColumn = grid.locator(".border-accent-primary").first();
  await todayColumn.waitFor({ state: "visible", timeout: 5_000 });
  console.log("[e2e] today's highlighted column is present");
});

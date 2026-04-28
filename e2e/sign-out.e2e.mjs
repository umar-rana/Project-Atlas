// e2e: Sign-out flow.
//
// 1. Navigate to /tasks/inbox as an authenticated user.
// 2. Open the user menu (avatar button).
// 3. Click "Sign out".
// 4. Wait for the redirect and confirm the browser lands on /sign-in.

import { runScenario, createAuthenticatedContext, navigateTo } from "./helpers.mjs";

await runScenario("sign-out", async (browser) => {
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    if (!e.message.includes("Hydration failed")) {
      console.error(`[e2e] pageerror: ${e.message}`);
    }
  });

  // ── Step 1: navigate to inbox as authenticated user ────────────────────────
  await navigateTo(page, "/tasks/inbox");

  // ── Step 2: open the user menu ────────────────────────────────────────────
  console.log("[e2e] opening user menu");
  const userMenuBtn = page.locator('[aria-label="User menu"]').first();
  await userMenuBtn.waitFor({ state: "visible", timeout: 10_000 });
  await userMenuBtn.click();

  // ── Step 3: click Sign out ────────────────────────────────────────────────
  console.log("[e2e] clicking Sign out");
  const signOutItem = page
    .getByRole("menuitem", { name: /sign out/i })
    .first();
  await signOutItem.waitFor({ state: "visible", timeout: 5_000 });
  await signOutItem.click();

  // ── Step 4: wait for redirect to /sign-in ─────────────────────────────────
  // The logout route redirects the browser to /sign-in.  The dev server may
  // bind on 0.0.0.0 which means the final URL's host could differ from the
  // one we navigated to.  We match by path only.
  console.log("[e2e] waiting for redirect to /sign-in");
  await page.waitForURL((url) => url.pathname === "/sign-in", { timeout: 10_000 });

  const currentUrl = page.url();
  if (!currentUrl.includes("/sign-in")) {
    throw new Error(
      `Expected redirect to /sign-in but landed on: ${currentUrl}`,
    );
  }
  console.log(`[e2e] confirmed redirect to /sign-in (${currentUrl})`);
});

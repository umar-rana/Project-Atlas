import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const STORYBOOK = process.env.STORYBOOK_URL ?? "http://localhost:5000";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp/storybook-sweep";
const CHROMIUM =
  process.env.CHROMIUM_PATH ||
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  undefined;

// Stories whose default render only shows a trigger; we need to interact to
// reveal the actual themed surface. action: a function (page) => Promise.
const interactions = [
  { id: "primitives-dialog--default", action: (p) => p.getByRole("button", { name: "Open dialog" }).click() },
  { id: "primitives-dialog--sizes", action: async (p) => { for (const b of await p.getByRole("button").all()) { try { await b.click({ trial: false }); break; } catch {} } } },
  { id: "primitives-drawer--right-side", action: (p) => p.getByRole("button", { name: /open/i }).first().click() },
  { id: "primitives-drawer--left-side", action: (p) => p.getByRole("button", { name: /open/i }).first().click() },
  { id: "primitives-popover--default", action: (p) => p.getByRole("button").first().click() },
  { id: "primitives-dropdownmenu--default", action: (p) => p.getByRole("button").first().click() },
  { id: "primitives-tooltip--basic", action: async (p) => { await p.getByRole("button").first().hover(); await p.waitForTimeout(800); } },
  { id: "primitives-tooltip--with-shortcut", action: async (p) => { await p.getByRole("button").first().hover(); await p.waitForTimeout(800); } },
  { id: "primitives-toast--variants", action: async (p) => { await p.getByRole("button", { name: /success/i }).click(); await p.waitForTimeout(150); await p.getByRole("button", { name: /info/i }).click(); await p.waitForTimeout(150); await p.getByRole("button", { name: /warning/i }).click(); await p.waitForTimeout(150); await p.getByRole("button", { name: /error/i }).click(); } },
  { id: "primitives-alertdialog--destructive-left", action: (p) => p.getByRole("button").first().click() },
  { id: "primitives-select--default", action: (p) => p.getByRole("combobox").first().click() },
  { id: "composed-commandpalette--default", action: (p) => p.getByRole("button").first().click() },
  { id: "composed-referenceautocomplete--default", action: (p) => p.locator("input").first().click().then(() => p.locator("input").first().fill("a")) },
  { id: "primitives-contextmenu--default", action: async (p) => { const target = p.getByText(/right-click here/i).first(); const box = await target.boundingBox(); if (box) { await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" }); } } },
];

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const themes = ["dark", "light"];
const results = [];
// Known noise: transient asset 404s the Storybook iframe occasionally
// emits and aborted in-flight requests when overlays unmount during the
// sweep. They aren't visual regressions and are intentionally filtered.
const NOISE_PATTERNS = [
  /Failed to load resource: the server responded with a status of 404/i,
  /The user aborted a request\./i,
  /AbortError/i,
];
const isNoise = (text) => NOISE_PATTERNS.some((p) => p.test(text));

const issues = [];
page.on("pageerror", (e) => {
  if (!isNoise(e.message)) issues.push(`pageerror: ${e.message}`);
});
page.on("console", (m) => {
  if (m.type() === "error" && !isNoise(m.text())) issues.push(`console.error: ${m.text()}`);
});

// After triggering the overlay we expect at least one of these roles to be
// visible. Toast variants only render <li> items (no semantic role on the
// outer Sonner container), so a ".sonner-toast" selector is included as a
// fallback. If nothing matches, the interaction is treated as a failure
// instead of silently producing a "trigger only" screenshot.
const OVERLAY_PRESENT = `
  document.querySelector('[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tooltip],[data-radix-popper-content-wrapper],[data-sonner-toaster] li,[data-state=open]')
    !== null
`;

for (const { id, action } of interactions) {
  for (const theme of themes) {
    issues.length = 0;
    const url = `${STORYBOOK}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
    const file = path.join(OUT_DIR, `${id}__${theme}__open.png`);
    try {
      await page.goto(url, { waitUntil: "load", timeout: 10000 });
      await page.waitForFunction(() => document.querySelector("#storybook-root")?.children?.length > 0, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(150);
      await action(page).catch((e) => issues.push(`action: ${e.message}`));
      const opened = await page
        .waitForFunction(OVERLAY_PRESENT, { timeout: 1500 })
        .then(() => true)
        .catch(() => false);
      await page.waitForTimeout(150);
      await page.screenshot({ path: file, fullPage: false });
      if (!opened) {
        issues.push("overlay never appeared after interaction");
        results.push({ id, theme, ok: false, error: "overlay never appeared", issues: [...issues] });
      } else {
        results.push({ id, theme, ok: true, issues: [...issues] });
      }
    } catch (err) {
      results.push({ id, theme, ok: false, error: err.message, issues: [...issues] });
    }
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT_DIR, "overlay-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
const noisy = results.filter((r) => r.ok && r.issues.length > 0);
console.log(`Total: ${results.length}, Failed: ${failed.length}, With issues: ${noisy.length}`);
for (const r of [...failed, ...noisy]) console.log(`  ${r.id}@${r.theme}: ${r.error ?? r.issues.join(" | ")}`);

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const STORYBOOK = process.env.STORYBOOK_URL ?? "http://localhost:5000";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp/storybook-sweep";
const CHROMIUM =
  process.env.CHROMIUM_PATH ||
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  undefined;

const indexJson = await (await fetch(`${STORYBOOK}/index.json`)).json();
const stories = Object.values(indexJson.entries).filter((e) => e.type === "story");

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

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
page.on("pageerror", (err) => {
  if (!isNoise(err.message)) issues.push(`pageerror: ${err.message}`);
});
page.on("console", (msg) => {
  if (msg.type() === "error" && !isNoise(msg.text())) issues.push(`console.error: ${msg.text()}`);
});

const themes = ["dark", "light"];
const results = [];

for (const story of stories) {
  for (const theme of themes) {
    const url = `${STORYBOOK}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`;
    issues.length = 0;
    const file = path.join(OUT_DIR, `${story.id}__${theme}.png`);
    if (process.env.SKIP_EXISTING && fs.existsSync(file)) {
      results.push({ id: story.id, title: story.title, name: story.name, theme, ok: true, skipped: true, issues: [] });
      continue;
    }
    try {
      await page.goto(url, { waitUntil: "load", timeout: 10000 });
      await page.waitForFunction(() => document.querySelector("#storybook-root")?.children?.length > 0, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(100);
      await page.screenshot({ path: file, fullPage: false });
      results.push({ id: story.id, title: story.title, name: story.name, theme, ok: true, issues: [...issues] });
    } catch (err) {
      results.push({ id: story.id, title: story.title, name: story.name, theme, ok: false, error: err.message, issues: [...issues] });
    }
  }
}

await browser.close();

fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.ok);
const withIssues = results.filter((r) => r.ok && r.issues.length > 0);
console.log(`Total: ${results.length}, Failed: ${failed.length}, With console issues: ${withIssues.length}`);
if (failed.length) console.log("Failed stories:", failed.map((r) => `${r.id}@${r.theme}`).join(", "));
if (withIssues.length) {
  console.log("Stories with browser issues:");
  for (const r of withIssues) console.log(`  ${r.id}@${r.theme}: ${r.issues.join(" | ")}`);
}

# Wave 0 — Storybook Theme Pass

**Date:** 2026‑04‑26
**Scope:** Verify every Wave 0 component in Storybook renders correctly under
both `data-theme="dark"` (default) and `data-theme="light"`.

## Method
1. **Static audit.** `rg` over `src/components/**` for hardcoded hex/rgb/hsl
   colors and Tailwind `dark:` variants — **zero matches**. Every component
   resolves color through Stratum tokens defined in `src/styles/tokens.css`.
2. **Automated sweep.** `scripts/storybook-theme-sweep.mjs` (playwright‑core)
   loads every story id from Storybook's `index.json` against a built static
   Storybook served on port 5000 and screenshots each story under
   `?globals=theme:dark` and `?globals=theme:light`. Output:
   `/tmp/storybook-sweep/` with `results.json`.
3. **Overlay sweep.** `scripts/storybook-overlay-sweep.mjs` opens the
   trigger‑driven stories (dialog, drawer, dropdown, popover, tooltip,
   alertdialog, select, contextmenu, command palette, reference autocomplete)
   in both themes, clicks the trigger, and screenshots the open state.
   Output: `/tmp/storybook-sweep/overlay-results.json`.
4. **Manual spot check.** Reviewed the high‑risk surfaces (overlays,
   inspector, app shell, three‑pane layout, status pill, tag, skeleton,
   inputs, card) frame‑by‑frame in both themes.

## Results
- **69 stories × 2 themes = 138 default screenshots** — `ok: 138`,
  `failed: 0`, console issues: 0. Raw output checked in at
  `docs/wave0-theme-pass/results.json`.
- **14 overlay stories × 2 themes = 28 overlay screenshots** — `ok: 28`,
  `failed: 0`, console issues: 0. Raw output checked in at
  `docs/wave0-theme-pass/overlay-results.json`.
- **1 bug found and fixed** (see below).
- **No contrast, no token, no broken‑story regressions** in either theme.

### Filtered noise
Both sweep scripts ignore a small allowlist of known transient signatures
the static Storybook iframe occasionally emits during the sweep — they
are not visual regressions:

- `Failed to load resource: ... 404` (asset URLs the iframe resolver
  hasn't materialized at first paint).
- `The user aborted a request.` / `AbortError` (in-flight requests
  cancelled when overlays unmount mid-sweep).

The patterns live in `NOISE_PATTERNS` at the top of each script, so they
are explicit and easy to remove if a real regression starts hiding behind
the same wording.

## Components verified

Total: **40 component source files / 69 stories**, every one rendered in
both `data-theme="dark"` and `data-theme="light"`. (Full story id list is
captured in `/tmp/story_ids.txt`.) Note: `README.md` historically rounded
this to "41" — the source‑of‑truth count from `src/components/**` is 40.

### Primitives — `src/components/ui/` (27)
1. alert-dialog
2. avatar
3. badge
4. button
5. card
6. checkbox
7. context-menu
8. dialog
9. drawer
10. dropdown-menu
11. icon-button
12. input
13. keyboard-shortcut
14. label
15. popover
16. progress
17. radio
18. select
19. separator
20. skeleton
21. spinner
22. status-pill
23. switch
24. tag
25. textarea
26. toast
27. tooltip

### Composed — `src/components/composed/` (7)
1. command-palette
2. empty-state
3. entity-link
4. inspector-panel
5. mention-pill
6. reference-autocomplete
7. tag-pill

### Layout — `src/components/layout/` (6)
1. app-shell
2. module-switcher
3. page-header
4. three-pane-layout
5. top-bar
6. two-pane-layout

(Theme infrastructure files — `theme-switcher.tsx` and
`providers/theme-provider.tsx` — are not user‑facing surfaces and were
exercised implicitly by every story flipping themes.)

## Bugs filed and fixed

### B‑01 — Toast did not follow Atlas theme
- **File:** `src/components/ui/toast.tsx`
- **Symptom:** `<Toaster theme="system" />` made Sonner read the OS color
  scheme, so toasts were always dark on a light Atlas page (and vice versa
  when the OS preferred light).
- **Fix:** Replaced with a `useAtlasTheme()` hook that reads
  `document.documentElement.dataset.theme` and subscribes to mutations on
  the `data-theme` attribute, then passes the resolved `'dark' | 'light'`
  to `<Toaster theme={…} />`.
- **Verification:** Re‑ran the overlay sweep — toast now matches the active
  Atlas theme in both modes.

## How to re-run locally

The two sweep scripts are checked in and `playwright-core` is now a
`devDependency`, so a clean clone needs only `npm install` to be ready.

```bash
# 1. Build a static Storybook (one-off; rebuild after component changes).
npm run build-storybook

# 2. Serve it on port 5000 (any static server works).
npx --yes http-server storybook-static -p 5000 -a 0.0.0.0 -c-1 --silent &
SB_PID=$!

# 3. Sweep every story in dark + light and capture screenshots.
npm run storybook:sweep            # → /tmp/storybook-sweep/results.json
npm run storybook:sweep:overlays   # → /tmp/storybook-sweep/overlay-results.json

kill "$SB_PID"
```

Optional environment variables (both scripts):

| Variable         | Default                       | Purpose                                          |
| ---------------- | ----------------------------- | ------------------------------------------------ |
| `STORYBOOK_URL`  | `http://localhost:5000`       | Where the built Storybook is being served.       |
| `OUT_DIR`        | `/tmp/storybook-sweep`        | Destination for PNG screenshots + `*.json`.      |
| `CHROMIUM_PATH`  | _(unset → playwright managed)_| Override Chromium binary (e.g. system Chromium). |
| `SKIP_EXISTING`  | _(unset)_                     | Skip stories whose screenshot file already exists (theme sweep only). |

A successful run prints `Total: …, Failed: 0, With console issues: 0`
for each script.

## CI snapshots — recommendation (not wired)
The two sweep scripts are deterministic and headless; wiring them into CI
is straightforward but **deferred** to keep Wave 0 free of new infra:

1. Run the local recipe above inside CI (Storybook build + serve + sweeps).
2. Compare the resulting PNGs against a committed baseline (e.g. via
   `pixelmatch` or Playwright's `toHaveScreenshot`).

Captured as a follow‑up (`#6 — Catch theme regressions automatically on
every change`) rather than landing here.

## Artifacts
- `scripts/storybook-theme-sweep.mjs` — default story sweep
- `scripts/storybook-overlay-sweep.mjs` — overlay open‑state sweep
- `/tmp/storybook-sweep/results.json` — 138 entries, all `ok`
- `/tmp/storybook-sweep/overlay-results.json` — 28 entries, all `ok`
- `/tmp/story_ids.txt` — full list of 69 verified story ids

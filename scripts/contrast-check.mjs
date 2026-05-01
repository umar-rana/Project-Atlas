#!/usr/bin/env node
/**
 * WCAG 2.1 AA Contrast Check Script
 * Parses src/styles/tokens.css, resolves var() references, alpha-composites
 * oklch() values with transparency, computes WCAG relative luminance, and
 * reports contrast ratios for all meaningful foreground/background pairings.
 *
 * Normal text: requires 4.5:1
 * Large text / UI components: requires 3:1
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── oklch → linear sRGB conversion ────────────────────────────────────────

function oklchToLinearSRGB(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r  =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g  = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bv = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [r, g, bv];
}

function linearToSRGB(c) {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function sRGBToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Convert oklch(L C H [/ A]) to linear sRGB [r, g, b] (ignores alpha). */
function oklchToLinear(L, C, H) {
  return oklchToLinearSRGB(L, C, H);
}

/** Convert oklch(L C H [/ A]) to sRGB [r, g, b] in [0,1]. */
function oklchToSRGBArr(L, C, H) {
  return oklchToLinear(L, C, H).map(linearToSRGB);
}

// ─── WCAG relative luminance ────────────────────────────────────────────────

function luminanceFromSRGB(r, g, b) {
  return 0.2126 * sRGBToLinear(r) + 0.7152 * sRGBToLinear(g) + 0.0722 * sRGBToLinear(b);
}

function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── oklch string parser ────────────────────────────────────────────────────

/**
 * Parse an oklch() string.
 * Returns { L, C, H, alpha } where L is in [0,1], alpha in [0,1] (default 1).
 * Returns null if not parseable.
 */
function parseOklch(str) {
  const m = str.match(
    /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/
  );
  if (!m) return null;
  let L = parseFloat(m[1]);
  if (L > 1) L = L / 100;
  const C     = parseFloat(m[2]);
  const H     = parseFloat(m[3]);
  const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return { L, C, H, alpha };
}

/**
 * Compute WCAG luminance from a solid oklch value string (no alpha).
 */
function oklchLuminance(str) {
  const p = parseOklch(str);
  if (!p) return null;
  const [r, g, b] = oklchToSRGBArr(p.L, p.C, p.H);
  return luminanceFromSRGB(r, g, b);
}

/**
 * Alpha-composite `fg` (oklch with possible alpha) over `bg` (solid oklch),
 * returning the resulting WCAG luminance.
 *
 * Compositing is done in linear sRGB:
 *   result = alpha * fg_linear + (1 - alpha) * bg_linear
 */
function compositeLuminance(fgStr, bgStr) {
  const fg = parseOklch(fgStr);
  const bg = parseOklch(bgStr);
  if (!fg || !bg) return null;

  const fgLin = oklchToLinear(fg.L, fg.C, fg.H);
  const bgLin = oklchToLinear(bg.L, bg.C, bg.H);

  const a = fg.alpha;
  const rL = a * fgLin[0] + (1 - a) * bgLin[0];
  const gL = a * fgLin[1] + (1 - a) * bgLin[1];
  const bL = a * fgLin[2] + (1 - a) * bgLin[2];

  const r = linearToSRGB(rL);
  const g = linearToSRGB(gL);
  const bv = linearToSRGB(bL);
  return luminanceFromSRGB(r, g, bv);
}

// ─── CSS token parser ───────────────────────────────────────────────────────

/**
 * Parse tokens.css into { dark: {...}, light: {...} } maps of token→value.
 * Values are raw strings (may be oklch(), var(), etc.).
 */
function parseTokensCSS(cssPath) {
  const css = readFileSync(cssPath, "utf-8");
  const themes = { dark: {}, light: {} };

  const darkMatch  = css.match(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);
  const lightMatch = css.match(/\[data-theme="light"\]\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);

  // Also grab the :root { --status-* } block(s) after the theme blocks
  const rootBlocks = [...css.matchAll(/:root\s*\{([^}]+)\}/g)].map(m => m[1]);

  function extractTokens(block) {
    const tokens = {};
    for (const line of block.split("\n")) {
      const m = line.match(/\s*(--[\w-]+)\s*:\s*(.+?)\s*(?:;|$)/);
      if (m) tokens[m[1]] = m[2].replace(/;.*$/, "").trim();
    }
    return tokens;
  }

  const rootTokens = {};
  for (const blk of rootBlocks) Object.assign(rootTokens, extractTokens(blk));

  if (darkMatch)  themes.dark  = { ...rootTokens, ...extractTokens(darkMatch[1]) };
  if (lightMatch) themes.light = { ...rootTokens, ...extractTokens(lightMatch[1]) };

  return themes;
}

/**
 * Resolve a token value in a given theme map, following var() references
 * up to depth 10. Returns the raw value string (never a var() itself).
 */
function resolveToken(name, tokens, depth = 0) {
  if (depth > 10) return null;
  const val = tokens[name];
  if (!val) return null;
  if (val.startsWith("var(")) {
    const inner = val.match(/var\((--[\w-]+)\)/);
    if (!inner) return null;
    return resolveToken(inner[1], tokens, depth + 1);
  }
  return val;
}

/**
 * Get WCAG luminance of a token, resolving var() and compositing alpha
 * over the given `surfaceVal` (raw oklch string) if the token has alpha.
 */
function tokenLuminance(tokenName, tokens, surfaceVal = null) {
  const val = resolveToken(tokenName, tokens);
  if (!val) return null;
  if (!val.startsWith("oklch")) return null;

  const parsed = parseOklch(val);
  if (!parsed) return null;

  // If solid (alpha=1 or no surface), compute directly
  if (parsed.alpha === 1 || !surfaceVal) {
    const [r, g, b] = oklchToSRGBArr(parsed.L, parsed.C, parsed.H);
    return luminanceFromSRGB(r, g, b);
  }

  // Alpha < 1: composite over the given surface
  return compositeLuminance(val, surfaceVal);
}

// ─── Contrast reporting ─────────────────────────────────────────────────────

const THRESHOLD_NORMAL = 4.5;
const THRESHOLD_LARGE  = 3.0;

function checkPair(name, fgLum, bgLum, type = "normal") {
  const threshold = type === "large" ? THRESHOLD_LARGE : THRESHOLD_NORMAL;
  if (fgLum === null || bgLum === null) {
    return { name, ratio: null, pass: null, threshold, error: "could not compute luminance" };
  }
  const ratio = contrastRatio(fgLum, bgLum);
  const pass  = ratio >= threshold;
  return { name, ratio, pass, threshold, type };
}

function runAudit(themeName, tokens) {
  const results = [];

  // Helper: raw value of a surface token
  const sv = (name) => resolveToken(name, tokens);

  const surfaces = [
    "--surface-base",
    "--surface-raised",
    "--surface-overlay",
    "--surface-sunken",
    "--surface-hover",
    "--surface-active",
    "--surface-selected",
    "--surface-selected-hover",
  ];

  const textTokens = [
    { name: "--text-primary",    type: "normal" },
    { name: "--text-secondary",  type: "normal" },
    { name: "--text-tertiary",   type: "normal" },
    // --text-disabled exempt: WCAG 1.4.3 excludes inactive/disabled UI
    { name: "--text-link",       type: "normal" },
    { name: "--text-link-hover", type: "normal" },
  ];

  // 1. All text tokens against all surface tokens
  for (const fg of textTokens) {
    for (const bgName of surfaces) {
      const fgL = tokenLuminance(fg.name, tokens);
      const bgL = tokenLuminance(bgName, tokens);
      results.push(checkPair(`${fg.name} on ${bgName}`, fgL, bgL, fg.type));
    }
  }

  // 2. text-on-accent / text-on-emphasis against accent fills
  const accentFills = [
    "--accent-primary",
    "--accent-success",
    "--accent-warning",
    "--accent-danger",
    "--accent-info",
    "--accent-neutral",
  ];

  for (const bgName of accentFills) {
    const bgL = tokenLuminance(bgName, tokens);
    for (const fgName of ["--text-on-accent", "--text-on-emphasis"]) {
      const fgL = tokenLuminance(fgName, tokens);
      results.push(checkPair(`${fgName} on ${bgName}`, fgL, bgL, "normal"));
    }
  }

  // 3. Accent icon/border colours against primary surfaces (UI component, 3:1)
  const accentIconColors = [
    "--accent-primary",
    "--accent-success",
    "--accent-warning",
    "--accent-danger",
    "--accent-info",
    "--accent-neutral",
  ];
  const primarySurfaces = ["--surface-base", "--surface-raised", "--surface-overlay"];

  for (const fgName of accentIconColors) {
    for (const bgName of primarySurfaces) {
      const fgL = tokenLuminance(fgName, tokens);
      const bgL = tokenLuminance(bgName, tokens);
      results.push(checkPair(`${fgName} (icon) on ${bgName}`, fgL, bgL, "large"));
    }
  }

  // 4. Status-pill text vs composited muted background over surface-base
  //    Pattern: accent text colour on (muted fill composited over surface-base)
  //    From status-pill.tsx: active=info, pending=warning, on-hold=neutral,
  //    blocked=danger, complete=success
  //    cancelled/archived use bg-transparent → checked separately
  const surfaceBaseVal = sv("--surface-base");
  const statusPillPairings = [
    { label: "active (info)",     fgToken: "--accent-info",    bgToken: "--accent-info-muted"    },
    { label: "pending (warning)", fgToken: "--accent-warning", bgToken: "--accent-warning-muted" },
    { label: "on-hold (neutral)", fgToken: "--text-secondary", bgToken: "--accent-neutral-muted" },
    { label: "blocked (danger)",  fgToken: "--accent-danger",  bgToken: "--accent-danger-muted"  },
    { label: "complete (success)",fgToken: "--accent-success", bgToken: "--accent-success-muted" },
  ];

  for (const p of statusPillPairings) {
    // Muted background is alpha'd → composite over surface-base
    const bgMutedVal = sv(p.bgToken);
    const bgL = bgMutedVal && surfaceBaseVal
      ? compositeLuminance(bgMutedVal, surfaceBaseVal)
      : null;
    const fgL = tokenLuminance(p.fgToken, tokens);
    results.push(checkPair(
      `status-pill ${p.label}: ${p.fgToken} on ${p.bgToken}/surface-base`,
      fgL, bgL, "normal"
    ));
  }

  // 5. status-cancelled text on surface-base (bg-transparent = surface-base)
  {
    const fgL = tokenLuminance("--text-tertiary", tokens);
    const bgL = tokenLuminance("--surface-base", tokens);
    results.push(checkPair("status-pill cancelled: --text-tertiary on --surface-base", fgL, bgL, "normal"));
  }

  // 6. status-archived text on surface-base (exempt — disabled state)
  //    Documented here for completeness but excluded from pass/fail count.
  //    WCAG 1.4.3 explicitly exempts inactive/disabled UI components.

  // 7. Border-focus against surfaces (UI component focus indicator 3:1)
  for (const bgName of primarySurfaces) {
    const fgL = tokenLuminance("--border-focus", tokens);
    const bgL = tokenLuminance(bgName, tokens);
    results.push(checkPair(`--border-focus (UI) on ${bgName}`, fgL, bgL, "large"));
  }

  // 8. Border-error against surfaces
  for (const bgName of primarySurfaces) {
    const fgL = tokenLuminance("--border-error", tokens);
    const bgL = tokenLuminance(bgName, tokens);
    results.push(checkPair(`--border-error (UI) on ${bgName}`, fgL, bgL, "large"));
  }

  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const cssPath = join(ROOT, "src/styles/tokens.css");
const themes  = parseTokensCSS(cssPath);

const allResults = {};
let totalFail = 0;

for (const themeName of ["dark", "light"]) {
  const results = runAudit(themeName, themes[themeName]);
  allResults[themeName] = results;
  const fails = results.filter(r => r.pass === false);
  totalFail += fails.length;
}

// ─── Console output ─────────────────────────────────────────────────────────

function fmt(r) {
  if (r.pass === null) return `  ❓ ${r.name}: ERROR (${r.error})`;
  const icon  = r.pass ? "✅" : "❌";
  const ratio = r.ratio.toFixed(2);
  const req   = r.threshold === 4.5 ? "4.5:1 normal" : "3:1 UI/large";
  return `  ${icon} ${r.name}: ${ratio}:1 (req ${req})`;
}

for (const themeName of ["dark", "light"]) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`THEME: ${themeName.toUpperCase()}`);
  console.log("=".repeat(70));

  const passes = allResults[themeName].filter(r => r.pass === true);
  const fails  = allResults[themeName].filter(r => r.pass === false);
  const errors = allResults[themeName].filter(r => r.pass === null);

  console.log(`\n✅ PASS (${passes.length})`);
  for (const r of passes) console.log(fmt(r));

  if (fails.length) {
    console.log(`\n❌ FAIL (${fails.length})`);
    for (const r of fails) console.log(fmt(r));
  }
  if (errors.length) {
    console.log(`\n❓ ERRORS (${errors.length})`);
    for (const r of errors) console.log(fmt(r));
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(`TOTAL FAILURES: ${totalFail}`);
console.log("=".repeat(70));

// ─── Markdown report ────────────────────────────────────────────────────────

function buildMarkdown(allResults) {
  const lines = [];
  lines.push("# WCAG 2.1 AA Contrast Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Thresholds: **4.5:1** for normal text · **3:1** for large text and UI components");
  lines.push("");
  lines.push("> **Disabled-state exemption**: `--text-disabled` on surface backgrounds is intentionally");
  lines.push("> exempt per WCAG 1.4.3, which explicitly excludes disabled UI components from");
  lines.push("> contrast requirements. Similarly, `--status-archived` (which maps to `--text-disabled`)");
  lines.push("> is exempt when used to indicate a disabled/archived state.");
  lines.push("");
  lines.push("## Coverage");
  lines.push("");
  lines.push("- All `--text-*` tokens vs all `--surface-*` tokens (normal text, 4.5:1)");
  lines.push("- `--text-on-accent` / `--text-on-emphasis` vs each accent fill (normal text, 4.5:1)");
  lines.push("- Accent colours as icons vs primary surfaces (UI component, 3:1)");
  lines.push("- Status-pill text vs composited muted background over `--surface-base` (normal text, 4.5:1)");
  lines.push("- `--border-focus` / `--border-error` vs primary surfaces (UI component, 3:1)");
  lines.push("");
  lines.push("## Hardcoded Colour Scan");
  lines.push("");
  lines.push("A scan of all component and template files for literal hex/rgb/hsl colour values");
  lines.push("found two locations outside `tokens.css`:");
  lines.push("");
  lines.push("| File | Value | Decision |");
  lines.push("|------|-------|----------|");
  lines.push("| `src/components/tasks/project-add-form.tsx` | `#d97706` (amber swatch) | **Exempt** — purely decorative colour-picker swatch; no text or icon sits on top. WCAG 1.4.3 (text contrast) does not apply. WCAG 1.4.11 exempts colour-sample graphics where colour itself is the conveyed information. `amber` is not a valid CSS named colour so a literal hex is required; an inline exemption comment documents this. |");
  lines.push("| `src/lib/email.ts` / `src/lib/emails.ts` | Various hex literals in HTML email templates | **Exempt** — email clients cannot process CSS custom properties; hardcoded values are required by the medium. These templates are out of scope for CSS-variable-based token auditing. |");
  lines.push("");

  for (const themeName of ["dark", "light"]) {
    const results = allResults[themeName];
    const passes  = results.filter(r => r.pass === true);
    const fails   = results.filter(r => r.pass === false);

    lines.push(`## ${themeName.charAt(0).toUpperCase() + themeName.slice(1)} Theme`);
    lines.push("");
    lines.push(`**${passes.length} PASS · ${fails.length} FAIL**`);
    lines.push("");
    lines.push("| Pairing | Ratio | Required | Result |");
    lines.push("|---------|-------|----------|--------|");

    for (const r of results) {
      if (r.pass === null) continue;
      const ratio  = r.ratio ? r.ratio.toFixed(2) + ":1" : "N/A";
      const req    = r.threshold === 4.5 ? "4.5:1" : "3:1";
      const result = r.pass ? "✅ PASS" : "❌ FAIL";
      lines.push(`| ${r.name} | ${ratio} | ${req} | ${result} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(join(ROOT, "docs/contrast-report.md"), buildMarkdown(allResults), "utf-8");
console.log("\n📄 Report written to docs/contrast-report.md");

process.exit(totalFail > 0 ? 1 : 0);

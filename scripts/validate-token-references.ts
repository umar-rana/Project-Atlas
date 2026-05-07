#!/usr/bin/env node
/**
 * validate-token-references.ts
 *
 * Scans all .tsx / .ts source files for raw shadcn/Radix color tokens that
 * must be replaced with Atlas Stratum design tokens before a PR can merge.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/validate-token-references.ts
 *   # or via the npm script:
 *   npm run validate-tokens
 *
 * Exit code 0 → clean. Exit code 1 → violations found.
 */

import { spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// ─── Forbidden patterns ──────────────────────────────────────────────────────
// Each entry maps a regex pattern to the preferred Stratum replacement.
const FORBIDDEN: Array<{ pattern: RegExp; replacement: string }> = [
  // ── Shadcn / Radix semantic tokens ─────────────────────────────────────────
  { pattern: /\bbg-popover\b/,               replacement: "bg-surface-raised" },
  { pattern: /\bbg-background\b/,            replacement: "bg-surface-base" },
  { pattern: /\bbg-muted\b/,                 replacement: "bg-surface-sunken" },
  { pattern: /\bbg-primary\b/,               replacement: "bg-accent-primary" },
  { pattern: /\bbg-secondary\b/,             replacement: "bg-surface-hover" },
  { pattern: /\bbg-destructive\b/,           replacement: "bg-accent-danger" },
  { pattern: /\bbg-accent\b(?![-_])/,        replacement: "bg-surface-hover" },
  { pattern: /\btext-muted-foreground\b/,    replacement: "text-text-tertiary" },
  { pattern: /\btext-foreground\b/,          replacement: "text-text-primary" },
  { pattern: /\btext-accent-foreground\b/,   replacement: "text-text-primary" },
  { pattern: /\btext-primary-foreground\b/,  replacement: "text-text-on-accent" },
  { pattern: /\btext-destructive\b/,         replacement: "text-accent-danger" },
  // Negative lookbehind (?<!-) prevents matching compound Stratum tokens like
  // `text-text-primary` or `bg-text-primary` (where `text-primary` is part of
  // a legitimate design token, not a raw shadcn/Tailwind alias).
  { pattern: /(?<!-)text-primary\b(?!\s*[-/])/, replacement: "text-accent-primary" },
  { pattern: /\bborder-border\b(?![-_])/,    replacement: "border-border-default" },
  { pattern: /\bshadow-lg\b/,               replacement: "shadow-2 or shadow-3" },
  { pattern: /\bring-primary\b/,             replacement: "ring-accent-primary" },

  // ── Raw Tailwind palette classes (SC-7) ─────────────────────────────────────
  // bg-{color}-{shade}: only flag concrete palette hues (not stratum tokens).
  // Red/Rose
  { pattern: /\bbg-red-\d+\b/,              replacement: "bg-accent-danger (or bg-viz-4)" },
  { pattern: /\bbg-rose-\d+\b/,             replacement: "bg-accent-danger" },
  // Orange/Amber
  { pattern: /\bbg-orange-\d+\b/,           replacement: "bg-viz-4-light (or var(--accent-amber))" },
  { pattern: /\bbg-amber-\d+\b/,            replacement: "bg-accent-warning (or bg-viz-3)" },
  // Yellow
  { pattern: /\bbg-yellow-\d+\b/,           replacement: "bg-viz-3" },
  // Green/Emerald/Teal
  { pattern: /\bbg-green-\d+\b/,            replacement: "bg-accent-success (or bg-viz-2)" },
  { pattern: /\bbg-emerald-\d+\b/,          replacement: "bg-accent-success" },
  // Blue/Sky/Cyan/Indigo
  { pattern: /\bbg-blue-\d+\b/,             replacement: "bg-accent-primary (or bg-viz-1)" },
  { pattern: /\bbg-sky-\d+\b/,              replacement: "bg-accent-info" },
  { pattern: /\bbg-cyan-\d+\b/,             replacement: "bg-accent-info" },
  { pattern: /\bbg-indigo-\d+\b/,           replacement: "bg-viz-1" },
  // Purple/Violet/Fuchsia
  { pattern: /\bbg-purple-\d+\b/,           replacement: "bg-viz-5" },
  { pattern: /\bbg-violet-\d+\b/,           replacement: "bg-viz-5" },
  { pattern: /\bbg-fuchsia-\d+\b/,          replacement: "bg-viz-6" },
  // Pink
  { pattern: /\bbg-pink-\d+\b/,             replacement: "bg-viz-7" },
  // Gray/Slate/Zinc/Neutral/Stone
  { pattern: /\bbg-gray-\d+\b/,             replacement: "bg-surface-* or bg-accent-neutral" },
  { pattern: /\bbg-slate-\d+\b/,            replacement: "bg-surface-* or bg-accent-neutral" },
  { pattern: /\bbg-zinc-\d+\b/,             replacement: "bg-surface-* or bg-accent-neutral" },
  { pattern: /\bbg-neutral-\d+\b/,          replacement: "bg-surface-* or bg-accent-neutral" },
  { pattern: /\bbg-stone-\d+\b/,            replacement: "bg-surface-* or bg-accent-neutral" },

  // text-{color}-{shade}: flag concrete palette hues.
  { pattern: /\btext-red-\d+\b/,            replacement: "text-accent-danger" },
  { pattern: /\btext-rose-\d+\b/,           replacement: "text-accent-danger" },
  { pattern: /\btext-orange-\d+\b/,         replacement: "text-accent-warning" },
  { pattern: /\btext-amber-\d+\b/,          replacement: "text-accent-warning" },
  { pattern: /\btext-yellow-\d+\b/,         replacement: "text-viz-3" },
  { pattern: /\btext-green-\d+\b/,          replacement: "text-accent-success" },
  { pattern: /\btext-emerald-\d+\b/,        replacement: "text-accent-success" },
  { pattern: /\btext-blue-\d+\b/,           replacement: "text-accent-primary" },
  { pattern: /\btext-sky-\d+\b/,            replacement: "text-accent-info" },
  { pattern: /\btext-indigo-\d+\b/,         replacement: "text-viz-1" },
  { pattern: /\btext-purple-\d+\b/,         replacement: "text-viz-5" },
  { pattern: /\btext-violet-\d+\b/,         replacement: "text-viz-5" },
  { pattern: /\btext-pink-\d+\b/,           replacement: "text-viz-7" },
  { pattern: /\btext-gray-\d+\b/,           replacement: "text-text-* or text-accent-neutral" },
  { pattern: /\btext-slate-\d+\b/,          replacement: "text-text-* or text-accent-neutral" },
  { pattern: /\btext-zinc-\d+\b/,           replacement: "text-text-* or text-accent-neutral" },
  { pattern: /\btext-neutral-\d+\b/,        replacement: "text-text-* or text-accent-neutral" },

  // border-{color}-{shade}: flag concrete palette hues.
  { pattern: /\bborder-red-\d+\b/,          replacement: "border-border-error (or border-accent-danger)" },
  { pattern: /\bborder-rose-\d+\b/,         replacement: "border-border-error" },
  { pattern: /\bborder-green-\d+\b/,        replacement: "border-accent-success" },
  { pattern: /\bborder-blue-\d+\b/,         replacement: "border-accent-primary" },
  { pattern: /\bborder-gray-\d+\b/,         replacement: "border-border-default or border-border-subtle" },
  { pattern: /\bborder-slate-\d+\b/,        replacement: "border-border-default or border-border-subtle" },
  { pattern: /\bborder-zinc-\d+\b/,         replacement: "border-border-default or border-border-subtle" },
  { pattern: /\bborder-neutral-\d+\b/,      replacement: "border-border-default or border-border-subtle" },

  // ring-{color}-{shade}: flag concrete palette hues.
  { pattern: /\bring-red-\d+\b/,            replacement: "ring-border-error" },
  { pattern: /\bring-blue-\d+\b/,           replacement: "ring-border-focus (or ring-accent-primary)" },
  { pattern: /\bring-gray-\d+\b/,           replacement: "ring-border-default" },
  { pattern: /\bring-slate-\d+\b/,          replacement: "ring-border-default" },

];

// ─── File scope ───────────────────────────────────────────────────────────────
// Use ripgrep's --type flag rather than shell-glob expansion so discovery is
// environment-independent.  --type ts covers both .ts and .tsx.
const INCLUDE_SCOPE = "src/";
const EXCLUDE_DIRS  = ["node_modules", ".next", "storybook-static"];

// ─── rg helper (no shell interpolation) ──────────────────────────────────────
// Runs ripgrep via spawnSync so that patterns containing `"` or `'` are passed
// as a literal argument (no shell quoting issues).  Returns stdout or "".
// Extra flags (e.g. ["-U"] for multiline) are prepended before the pattern arg.
function runRg(pattern: string, extraFlags: string[] = [], scope: string = INCLUDE_SCOPE): string {
  const result = spawnSync(
    "rg",
    [
      "--with-filename",
      "--line-number",
      "--column",
      "--no-heading",
      "--type", "ts",
      "-P",
      ...extraFlags,
      pattern,
      scope,
    ],
    { encoding: "utf8" },
  );
  // rg exits 1 when no matches — that is expected and fine.
  // Only surface actual errors (exit 2 = bad pattern / rg crash).
  if (result.status === 2 || result.error) {
    const detail = result.error?.message ?? (result.stderr ?? "");
    throw new Error(`rg failed (exit ${result.status ?? "signal"}): ${detail}`);
  }
  return result.stdout ?? "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  col: number;
  token: string;
  replacement: string;
  snippet: string;
}

// Directories intentionally exempt from the FORBIDDEN token-pattern check.
// The admin shell uses a custom monospace dark theme (not the Stratum design
// system) with semantic red/amber/green for security status — this is by design.
const FORBIDDEN_ALLOWLIST_DIRS = ["src/app/admin/", "src/components/admin/"];

function parseRgLines(
  raw: string,
  token: string,
  replacement: string,
  allowlistDirs: string[] = [],
  allowlistFiles: string[] = [],
): Violation[] {
  const violations: Violation[] = [];
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
    if (!match) continue;
    const [, file, lineStr, colStr, snippet] = match;
    if (EXCLUDE_DIRS.some((d) => file!.includes(d))) continue;
    if (allowlistDirs.some((d) => file!.includes(d))) continue;
    if (allowlistFiles.some((f) => file!.includes(f))) continue;
    violations.push({
      file:        path.relative(process.cwd(), file!),
      line:        parseInt(lineStr!, 10),
      col:         parseInt(colStr!, 10),
      token,
      replacement,
      snippet:     snippet!.trim(),
    });
  }
  return violations;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const { pattern, replacement } of FORBIDDEN) {
    const rgPattern = pattern.source;
    const raw = runRg(rgPattern);
    violations.push(
      ...parseRgLines(raw, pattern.source, replacement, FORBIDDEN_ALLOWLIST_DIRS),
    );
  }

  return violations.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line,
  );
}

// ─── Raw hex literal checker in TSX (SC-7 guardrail) ─────────────────────────
//
// Flags raw hex color strings (#rrggbb / #rgb) inside quoted JS/JSX values.
// These must be replaced with a CSS variable (var(--token)) or Tailwind token.
//
// Pattern: ["']#<3-or-6 hex chars>["']   — hex value immediately wrapped in
// JS quotes.  This avoids false positives for:
//   • placeholder="#add tag"  (space after hex chars → not followed by quote)
//   • bg-[#0a0a0a]            (# preceded by bracket, not quote)
//   • email.ts template literals like `color: #1a1a1a;` (# not quote-bounded)
//
// Allowlist — files with intentional / approved hex usage:
//   • src/app/layout.tsx                         — theme-color <meta> baseline
//   • src/core/alerts/index.ts                   — Slack webhook status colors
//   • src/components/projects/type-config-editor — color palette picker (#456)

const HEX_ALLOWLIST_FILES = [
  // theme-color <meta> baseline — browser chrome accent, must be raw hex
  "src/app/layout.tsx",
  // Slack webhook status colors — external API requires raw hex strings
  "src/core/alerts/index.ts",
  // Color palette picker — user-facing hex swatches (free-form color input)
  "src/components/projects/type-config-editor.tsx",
  // PDFKit canvas API (.fillColor / .strokeColor) — CSS vars not supported by pdfkit
  "src/core/conversion/pdf-export.ts",
  // TipTap mark API requires hex; `value` fields ARE the canonical token source values
  // (the corresponding CSS vars in tokens.css reference these same hex codes)
  "src/core/notes/colors.ts",
  // Project-type SVG/canvas icon color map — rendered by pdfkit/canvas, not CSS
  "src/core/projects/type-icons.ts",
  // TipTap Highlight extension accent color — extension config, not a Tailwind class
  "src/core/editor/tiptap-config.ts",
];

function findHexLiteralViolations(): Violation[] {
  // Matches exactly 3-char or 6-char hex values immediately surrounded by JS
  // string delimiters (single or double quote).  This safely avoids:
  //   • placeholder="#add tag"  → "add" is followed by space, not quote
  //   • bg-[#0a0a0a]            → # is preceded by "[", not a quote
  //   • email template literals  → hex is embedded mid-string, not quote-bounded
  // The pattern is passed as a literal argv element via runRg (no shell quoting).
  const hexPattern = `["']#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?["']`;
  const raw = runRg(hexPattern);
  return parseRgLines(
    raw,
    "raw hex color literal",
    "a CSS variable (var(--token-name)) or Tailwind token class",
    [],
    HEX_ALLOWLIST_FILES,
  );
}

// ─── Interactive title= checker (SC-1 guardrail) ─────────────────────────────
//
// Flags raw HTML `title=` on interactive elements: <button>, <a>, and any
// element with `role="button"` or a visible `onClick` handler.
// These must be replaced with `<Hint label="...">` (visible hover tooltip).
//
// Implementation: TypeScript file scanner (not PCRE2 multiline).
// A PCRE2 multiline approach using `(?!>)` breaks when prop values contain
// `>` (e.g. arrow functions: `onClick={(e) => { ... }}`).  The file scanner
// correctly tracks brace depth so `>` inside `{}` is never mistaken for the
// JSX element's closing `>`.
//
// Allowlist:
//   • src/core/email.ts  — HTML email templates; native title= is intentional
//   (admin shell exempt via EXCLUDE_DIRS handling in findViolations)

// Files to skip entirely for the title= check.
const TITLE_ALLOWLIST_FILES = ["src/core/email.ts"];

// Regexes for the interactive-title= file scanner.
//
// INTERACTIVE_OPEN_RE — immediately flags the current element as interactive:
//   <button …  <a …  role="button"  role='button'
// TENTATIVE_OPEN_RE   — any JSX element opening: <SomeName … (could be interactive)
// ONCLICK_PROP_RE     — onClick= prop at depth 0 → upgrades tentative → interactive
// TITLE_PROP_RE       — title= prop value starting with ", ', {, or `
const INTERACTIVE_OPEN_RE = /^\s*<(button|a)(\s|>|$)|role=["']button["']/;
const TENTATIVE_OPEN_RE   = /^\s*<[A-Za-z]/;
const ONCLICK_PROP_RE     = /\bonClick=/;
const TITLE_PROP_RE       = /\btitle=["'{`]/;

// Three-state scanner:
//   "none"        — outside any element's prop list
//   "tentative"   — inside an element's prop list but not yet confirmed interactive
//   "interactive" — inside an interactive element's prop list; flag title=
type ScanMode = "none" | "tentative" | "interactive";

// Core scan logic, shared between the main source scan and the self-test fixture.
function scanLinesForTitleViolations(
  file: string,
  lines: string[],
): Violation[] {
  const violations: Violation[] = [];
  let mode:         ScanMode = "none";
  let braceDepth:   number   = 0;
  let prevNonSpace: string   = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (mode === "none") {
      if (INTERACTIVE_OPEN_RE.test(line)) {
        mode         = "interactive";
        braceDepth   = 0;
        prevNonSpace = "";
      } else if (TENTATIVE_OPEN_RE.test(line)) {
        mode         = "tentative";
        braceDepth   = 0;
        prevNonSpace = "";
        // If onClick= is on the same opening line, immediately go interactive.
        if (ONCLICK_PROP_RE.test(line)) mode = "interactive";
      }
    } else if (mode === "tentative") {
      // Upgrade to interactive if we see a confirming prop at depth 0.
      if (braceDepth === 0 && (ONCLICK_PROP_RE.test(line) || /role=["']button["']/.test(line))) {
        mode = "interactive";
      }
    }

    if (mode === "interactive") {
      // Flag title= at depth 0 — it is a JSX prop, not inside a prop value.
      if (braceDepth === 0 && TITLE_PROP_RE.test(line)) {
        violations.push({
          file:        file,
          line:        i + 1,
          col:         line.indexOf("title=") + 1,
          token:       "title= on interactive element",
          replacement: '<Hint label="…"> wrapper (SC-1)',
          snippet:     line.trim(),
        });
      }
    }

    if (mode !== "none") {
      // Update brace depth and detect the closing `>` of the opening tag.
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]!;
        if (ch === "{") {
          braceDepth++;
        } else if (ch === "}") {
          braceDepth = Math.max(0, braceDepth - 1);
        } else if (ch === ">" && braceDepth === 0 && prevNonSpace !== "=") {
          // End of element's opening-tag prop list (excludes `=>` arrows).
          mode         = "none";
          braceDepth   = 0;
          prevNonSpace = "";
          break;
        }
        if (ch.trim() !== "") prevNonSpace = ch;
      }
    } else {
      prevNonSpace = "";
    }
  }

  return violations;
}

function findInteractiveTitleViolations(): Violation[] {
  // Enumerate all .ts/.tsx source files via ripgrep (same scope as other checks).
  const lsResult = spawnSync("rg", ["--files", "--type", "ts", INCLUDE_SCOPE], {
    encoding: "utf8",
  });
  const files = (lsResult.stdout ?? "").trim().split("\n").filter(Boolean);

  const violations: Violation[] = [];

  for (const file of files) {
    if (EXCLUDE_DIRS.some((d) => file.includes(d))) continue;
    if (TITLE_ALLOWLIST_FILES.some((f) => file.includes(f))) continue;

    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const v of scanLinesForTitleViolations(path.relative(process.cwd(), file), lines)) {
      violations.push(v);
    }
  }

  return violations;
}

// ─── Self-test fixture ────────────────────────────────────────────────────────
// Proves the hex and title= guardrails are actually active by running them
// against small known-bad fixtures.  Exits immediately with code 2 if a
// guardrail is broken (silently returning no violations when it should fire).
function selfTest(): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stratum-selftest-"));

  try {
    // ── Hex guardrail ───────────────────────────────────────────────────────
    const hexFile = path.join(tmpDir, "hex-fixture.tsx");
    fs.writeFileSync(hexFile, `const color = "#3b82f6"; // raw hex — must be caught\n`);

    const hexPattern = `["']#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?["']`;
    const hexRaw     = runRg(hexPattern, [], hexFile);
    if (!hexRaw.trim()) {
      console.error("✗ SELF-TEST FAILED: hex guardrail did not catch '#3b82f6'.");
      process.exit(2);
    }

    // ── title= guardrail — same-line case ───────────────────────────────────
    const titleFileA = path.join(tmpDir, "title-same-line.tsx");
    fs.writeFileSync(titleFileA, `<button title="foo">click</button>\n`);
    const titleViolsA = scanLinesForTitleViolations(
      titleFileA,
      fs.readFileSync(titleFileA, "utf8").split("\n"),
    );
    if (titleViolsA.length === 0) {
      console.error(
        "✗ SELF-TEST FAILED: title= guardrail did not catch same-line <button title=…>.",
      );
      process.exit(2);
    }

    // ── title= guardrail — multiline case (the tricky one) ──────────────────
    // An element with an arrow-function prop that contains `>`, then `title=`
    // on its own line.  The old PCRE2 `(?!>)` approach failed this case.
    const titleFileB = path.join(tmpDir, "title-multiline.tsx");
    fs.writeFileSync(
      titleFileB,
      [
        `<button`,
        `  type="button"`,
        `  onClick={(e) => { e.stopPropagation(); }}`,
        `  title={\`\${count} items\`}`,
        `>`,
        `  click`,
        `</button>`,
      ].join("\n") + "\n",
    );
    const titleViolsB = scanLinesForTitleViolations(
      titleFileB,
      fs.readFileSync(titleFileB, "utf8").split("\n"),
    );
    if (titleViolsB.length === 0) {
      console.error(
        "✗ SELF-TEST FAILED: title= guardrail missed multiline <button onClick={…=>…} title=…>.",
      );
      process.exit(2);
    }

    // ── title= guardrail — onClick= element case ─────────────────────────────
    // A non-button/non-anchor element with onClick= should also be flagged.
    const titleFileC = path.join(tmpDir, "title-onclick.tsx");
    fs.writeFileSync(
      titleFileC,
      [
        `<div`,
        `  onClick={handleClick}`,
        `  title="some tooltip"`,
        `>`,
        `  content`,
        `</div>`,
      ].join("\n") + "\n",
    );
    const titleViolsC = scanLinesForTitleViolations(
      titleFileC,
      fs.readFileSync(titleFileC, "utf8").split("\n"),
    );
    if (titleViolsC.length === 0) {
      console.error(
        "✗ SELF-TEST FAILED: title= guardrail missed onClick= element with title=.",
      );
      process.exit(2);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Run self-test first to prove guardrails are active (not silently broken).
selfTest();

const violations      = findViolations();
const hexViolations   = findHexLiteralViolations();
const titleViolations = findInteractiveTitleViolations();
const allViolations   = [...violations, ...hexViolations, ...titleViolations].sort((a, b) =>
  a.file.localeCompare(b.file) || a.line - b.line,
);

if (allViolations.length === 0) {
  console.log("✓ No forbidden design-token references found.");
  process.exit(0);
}

console.error(`\n✗ Found ${allViolations.length} forbidden design-token reference(s):\n`);

let lastFile = "";
for (const v of allViolations) {
  if (v.file !== lastFile) {
    console.error(`  ${v.file}`);
    lastFile = v.file;
  }
  console.error(`    ${v.line}:${v.col}  "${v.token}"  →  use "${v.replacement}"`);
  console.error(`      ${v.snippet}`);
}

console.error("\nReplace each token with its Stratum equivalent (see CONTRIBUTING.md §Tokens).\n");
process.exit(1);

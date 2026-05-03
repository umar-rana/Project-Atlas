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

import { execSync } from "child_process";
import * as path from "path";

// ─── Forbidden patterns ──────────────────────────────────────────────────────
// Each entry maps a regex pattern to the preferred Stratum replacement.
const FORBIDDEN: Array<{ pattern: RegExp; replacement: string }> = [
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
  { pattern: /\btext-primary\b(?!\s*[-/])/,  replacement: "text-accent-primary" },
  { pattern: /\bborder-border\b(?![-_])/,    replacement: "border-border-default" },
  { pattern: /\bshadow-lg\b/,               replacement: "shadow-2 or shadow-3" },
  { pattern: /\bring-primary\b/,             replacement: "ring-accent-primary" },
];

// ─── File scope ───────────────────────────────────────────────────────────────
const INCLUDE_GLOB = "src/**/*.{ts,tsx}";
const EXCLUDE_DIRS  = ["node_modules", ".next", "storybook-static"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  col: number;
  token: string;
  replacement: string;
  snippet: string;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const { pattern, replacement } of FORBIDDEN) {
    // Build a ripgrep-compatible literal pattern from the regex source.
    // We strip the word-boundary assertions (\b) because rg uses PCRE2 only with -P.
    const rgPattern = pattern.source.replace(/\\b/g, "\\b");

    let raw: string;
    try {
      raw = execSync(
        `rg --with-filename --line-number --column --no-heading -P "${rgPattern}" ${INCLUDE_GLOB}`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
      );
    } catch {
      // rg exits 1 when no matches — that's fine.
      continue;
    }

    for (const line of raw.trim().split("\n").filter(Boolean)) {
      // Format: file:line:col:snippet
      const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
      if (!match) continue;
      const [, file, lineStr, colStr, snippet] = match;

      // Skip excluded directories.
      if (EXCLUDE_DIRS.some((d) => file!.includes(d))) continue;

      violations.push({
        file:        path.relative(process.cwd(), file!),
        line:        parseInt(lineStr!, 10),
        col:         parseInt(colStr!, 10),
        token:       pattern.source,
        replacement,
        snippet:     snippet!.trim(),
      });
    }
  }

  return violations.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const violations = findViolations();

if (violations.length === 0) {
  console.log("✓ No forbidden design-token references found.");
  process.exit(0);
}

console.error(`\n✗ Found ${violations.length} forbidden design-token reference(s):\n`);

let lastFile = "";
for (const v of violations) {
  if (v.file !== lastFile) {
    console.error(`  ${v.file}`);
    lastFile = v.file;
  }
  console.error(`    ${v.line}:${v.col}  "${v.token}"  →  use "${v.replacement}"`);
  console.error(`      ${v.snippet}`);
}

console.error("\nReplace each token with its Stratum equivalent (see CONTRIBUTING.md §Tokens).\n");
process.exit(1);

#!/usr/bin/env node
/**
 * validate-migrations.mjs
 *
 * Checks every SQL file under prisma/migrations/ for the transaction-escape
 * pattern required by PostgreSQL when using CREATE/DROP INDEX CONCURRENTLY.
 *
 * PostgreSQL error 25001 is thrown at runtime if CONCURRENTLY is used inside
 * a transaction block.  Prisma wraps migrations in BEGIN…COMMIT automatically,
 * so any migration that uses CONCURRENTLY MUST:
 *   1. Have a bare `COMMIT;` as the very first SQL statement (closes Prisma's txn)
 *   2. Have a bare `BEGIN;` as the very last SQL statement (opens a dummy txn
 *      for Prisma's final COMMIT to close cleanly)
 *
 * This script exits with code 1 and a clear error message listing every
 * migration file that violates either rule.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MIGRATIONS_DIR = "prisma/migrations";

/**
 * Strip SQL single-line comments (-- …) and block comments (/* … *\/) so that
 * keywords mentioned only inside comments are not treated as real SQL.
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "");
}

/**
 * Returns true if `content` contains a real (non-comment) CONCURRENTLY index
 * operation.
 */
function hasConcurrently(content) {
  return /\b(CREATE|DROP)\s+INDEX\s+CONCURRENTLY\b/i.test(
    stripComments(content)
  );
}

/**
 * Returns an object describing which parts of the transaction-escape pattern
 * are present or missing.
 *
 *   missingOpenSentinel  — `COMMIT;` is not the first non-whitespace SQL statement
 *   missingCloseSentinel — `BEGIN;` is not the last non-whitespace SQL statement
 */
function checkSentinels(content) {
  const stripped = stripComments(content).trim();

  const missingOpenSentinel = !/^COMMIT\s*;/i.test(stripped);
  const missingCloseSentinel = !/BEGIN\s*;$/i.test(stripped);

  return { missingOpenSentinel, missingCloseSentinel };
}

async function collectSqlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sqlPath = join(dir, entry.name, "migration.sql");
      files.push(sqlPath);
    }
  }
  return files;
}

async function main() {
  let files;
  try {
    files = await collectSqlFiles(MIGRATIONS_DIR);
  } catch (err) {
    console.error(`ERROR: Could not read migrations directory: ${err.message}`);
    process.exit(1);
  }

  const violations = [];

  for (const filePath of files) {
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    if (!hasConcurrently(content)) continue;

    const { missingOpenSentinel, missingCloseSentinel } =
      checkSentinels(content);

    if (missingOpenSentinel || missingCloseSentinel) {
      violations.push({ filePath, missingOpenSentinel, missingCloseSentinel });
    }
  }

  if (violations.length === 0) {
    console.log(
      `✓ All ${files.length} migration file(s) passed CONCURRENTLY validation.`
    );
    process.exit(0);
  }

  console.error(
    `\nERROR: The following migration file(s) use CREATE/DROP INDEX CONCURRENTLY`
  );
  console.error(
    `but are missing part of the required transaction-escape pattern.\n`
  );
  console.error(
    `PostgreSQL will throw error 25001 ("ERROR: CREATE INDEX CONCURRENTLY cannot`
  );
  console.error(`run inside a transaction block") when these migrations run.\n`);
  console.error(`Affected file(s):`);

  for (const { filePath, missingOpenSentinel, missingCloseSentinel } of violations) {
    console.error(`  - ${filePath}`);
    if (missingOpenSentinel) {
      console.error(
        `      ✗ Missing opening sentinel: first SQL statement must be a bare COMMIT;`
      );
    }
    if (missingCloseSentinel) {
      console.error(
        `      ✗ Missing closing sentinel: last SQL statement must be a bare BEGIN;`
      );
    }
  }

  console.error(`\nRequired pattern (see docs/migrations/concurrently-index-runbook.md):`);
  console.error(`  COMMIT;                          -- closes Prisma's auto-BEGIN`);
  console.error(`  ... CREATE INDEX CONCURRENTLY ...`);
  console.error(`  BEGIN;                           -- opens dummy txn for Prisma's COMMIT\n`);
  process.exit(1);
}

main();

#!/usr/bin/env node
/**
 * verify-wave1-schema.mjs
 *
 * Verifies that the GTD Inbox Wave 1 migration has been applied to the database.
 * Checks for the presence of all Wave 1 columns on the Capture and Task tables.
 *
 * Exits with code 0 on success, code 1 on any missing column.
 *
 * Run directly:   node scripts/verify-wave1-schema.mjs
 * Called by:      scripts/post-merge.sh (after prisma migrate deploy)
 */

import pg from "pg";

function resolveDbUrl() {
  const raw = process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "";
  return raw.replace(/^'+|'+$/g, "");
}

const WAVE1_CAPTURE_COLUMNS = [
  "state",
  "processed_at",
  "processed_to_type",
  "processed_to_id",
  "migration_source",
  "parser_proposal",
];

const WAVE1_TASK_COLUMNS = [
  "is_someday",
  "someday_review_date",
  "delegated_to_text",
  "delegated_to_person_id",
  "follow_up_date",
  "migration_note",
];

async function getColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = $1`,
    [tableName],
  );
  return new Set(result.rows.map((r) => r.column_name));
}

async function main() {
  const url = resolveDbUrl();
  if (!url) {
    console.error("ERROR: No DATABASE_URL or DATABASE_URL_NEON set.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const captureColumns = await getColumns(client, "Capture");
    const taskColumns = await getColumns(client, "Task");

    const missing = [];

    for (const col of WAVE1_CAPTURE_COLUMNS) {
      if (!captureColumns.has(col)) {
        missing.push(`Capture.${col}`);
      }
    }

    for (const col of WAVE1_TASK_COLUMNS) {
      if (!taskColumns.has(col)) {
        missing.push(`Task.${col}`);
      }
    }

    if (missing.length > 0) {
      console.error(
        "\nERROR: The following Wave 1 GTD Inbox columns are missing from the database.",
      );
      console.error(
        "Run 'npx prisma migrate deploy' to apply the 20260504000000_gtd_inbox_wave1 migration.\n",
      );
      for (const col of missing) {
        console.error(`  ✗ ${col}`);
      }
      console.error();
      process.exit(1);
    }

    console.log(
      `✓ All ${WAVE1_CAPTURE_COLUMNS.length} Wave 1 Capture columns present.`,
    );
    console.log(
      `✓ All ${WAVE1_TASK_COLUMNS.length} Wave 1 Task columns present.`,
    );
    console.log("✓ Wave 1 GTD Inbox schema verified.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});

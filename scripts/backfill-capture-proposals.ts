/**
 * One-shot backfill for Capture.parser_proposal (Capture Processing
 * Refinement CR §3.8 / rule 8.7).
 *
 * Re-runs the parser pipeline on each `proposed`-state Capture whose
 * stored parser_proposal looks thin — i.e. is missing the structured
 * fields the disposition forms expect (`proposed_disposition`,
 * `contexts`, `tags`, `due_date`). Already-rich proposals are skipped,
 * so the script is idempotent and safe to re-run.
 *
 * Rule 8.7 — "Backfill is one-shot. Run once. After that, new captures
 * use the new parser automatically. If for some reason backfill needs
 * to re-run (bug fix, parser improvement), it should detect already-
 * enriched proposals and skip them."
 *
 * Run with:
 *   npx tsx scripts/backfill-capture-proposals.ts
 *   npx tsx scripts/backfill-capture-proposals.ts --dry-run
 *   npx tsx scripts/backfill-capture-proposals.ts --user-id <uuid>
 *
 * Cost note: Tier 2 AI fires for low-confidence Tier 1 results.
 * For ~50 captures this is trivial. For larger user bases, batch &
 * rate-limit appropriately (CR §3.8.2).
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local before importing modules that read env vars.
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const userIdFlag = args.indexOf("--user-id");
const TARGET_USER_ID = userIdFlag >= 0 ? args[userIdFlag + 1] : undefined;

interface RawProposal {
  proposed_disposition?: unknown;
  contexts?: unknown;
  tags?: unknown;
  due_date?: unknown;
  due_date_has_time?: unknown;
  proposed_body?: unknown;
}

function isThinProposal(p: unknown): boolean {
  if (!p || typeof p !== "object") return true;
  const r = p as RawProposal;
  // "Rich" if disposition is set AND at least one structured field exists.
  if (!r.proposed_disposition) return true;
  const hasStructured =
    (Array.isArray(r.contexts) && r.contexts.length > 0) ||
    (Array.isArray(r.tags) && r.tags.length > 0) ||
    r.due_date != null;
  return !hasStructured;
}

async function main() {
  const { db } = await import("../src/core/db");
  const { runPipeline } = await import("../src/core/capture/parser");

  console.log(
    `Backfill mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}` +
      (TARGET_USER_ID ? ` — user ${TARGET_USER_ID}` : " — all users"),
  );

  const where: Record<string, unknown> = { state: "proposed", deleted_at: null };
  if (TARGET_USER_ID) where.user_id = TARGET_USER_ID;

  const captures = await db.capture.findMany({
    where,
    select: {
      id: true,
      user_id: true,
      raw_text: true,
      parser_proposal: true,
    },
    orderBy: { created_at: "asc" },
  });

  console.log(`Scanning ${captures.length} 'proposed'-state capture(s)…`);

  let skipped = 0;
  let updated = 0;
  let errors = 0;

  // Cache user context (projects / contexts / tags / threshold / tz) so we
  // don't refetch per-capture for the same user.
  type UserCache = {
    timezone: string;
    threshold: number;
    aiEnabled: boolean;
    projectTitles: string[];
    contextNames: string[];
    tagNames: string[];
  };
  const userCache = new Map<string, UserCache>();

  async function userCtxFor(userId: string): Promise<UserCache> {
    const cached = userCache.get(userId);
    if (cached) return cached;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { timezone: true, ai_confidence_threshold: true, ai_budget_usd: true },
    });
    const [projects, contexts, tags] = await Promise.all([
      db.project.findMany({
        where: { user_id: userId, deleted_at: null },
        select: { title: true },
      }),
      db.context.findMany({
        where: { user_id: userId, deleted_at: null },
        select: { name: true },
      }),
      db.tag.findMany({
        where: { user_id: userId, deleted_at: null },
        select: { name: true },
      }),
    ]);
    const built: UserCache = {
      timezone: user?.timezone ?? "UTC",
      threshold: user?.ai_confidence_threshold ?? 0.7,
      aiEnabled: user?.ai_budget_usd == null || user.ai_budget_usd > 0,
      projectTitles: projects.map((p) => p.title),
      contextNames: contexts.map((c) => c.name),
      tagNames: tags.map((t) => t.name),
    };
    userCache.set(userId, built);
    return built;
  }

  for (const cap of captures) {
    if (!isThinProposal(cap.parser_proposal)) {
      skipped++;
      continue;
    }

    try {
      const userCtx = await userCtxFor(cap.user_id);
      const result = await runPipeline(
        cap.raw_text,
        undefined,
        {
          userId: cap.user_id,
          userTimezone: userCtx.timezone,
          confidenceThreshold: userCtx.threshold,
          aiEnabled: userCtx.aiEnabled,
          projectTitles: userCtx.projectTitles,
          contextNames: userCtx.contextNames,
          tagNames: userCtx.tagNames,
          source: "api",
        },
        false, // don't persist a CaptureParseLog entry for the backfill
      );

      if (DRY_RUN) {
        console.log(
          `would update ${cap.id} → disposition=${result.parsed.proposed_disposition ?? "—"}, ` +
            `contexts=${result.parsed.contexts.length}, tags=${result.parsed.tags.length}, ` +
            `due_date_has_time=${result.parsed.due_date_has_time ?? false}`,
        );
      } else {
        await db.capture.update({
          where: { id: cap.id },
          data: { parser_proposal: result.parsed as unknown as object },
        });
      }
      updated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`error backfilling ${cap.id}: ${msg}`);
    }
  }

  console.log("\n── Backfill report ─────────────────────────────");
  console.log(`Scanned:  ${captures.length}`);
  console.log(`Skipped:  ${skipped} (already rich)`);
  console.log(`Updated:  ${updated}${DRY_RUN ? " (dry-run, no writes)" : ""}`);
  console.log(`Errors:   ${errors}`);
  console.log("─────────────────────────────────────────────────");

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Backfill script: re-enriches all `proposed`-state captures that don't yet
 * have a `proposed_disposition` field in their parser_proposal.
 *
 * Idempotent: skips captures whose proposals already contain proposed_disposition.
 * Run with: npx tsx prisma/scripts/backfill-capture-proposals.ts
 */

import { PrismaClient } from "@prisma/client";
import { runTier1 } from "../../src/core/capture/parser/tier-1-local";
import { scoreConfidence } from "../../src/core/capture/parser/confidence";
import type { ParsedCapture } from "../../src/core/capture/parser/types";

const db = new PrismaClient();

async function main() {
  console.log("Starting capture proposal backfill…");

  const captures = await db.capture.findMany({
    where: {
      state: "proposed",
      deleted_at: null,
      processed_at: null,
    },
    select: {
      id: true,
      raw_text: true,
      user_id: true,
      parser_proposal: true,
    },
    orderBy: { created_at: "desc" },
  });

  console.log(`Found ${captures.length} proposed captures to evaluate.`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const capture of captures) {
    try {
      const proposal = capture.parser_proposal as Record<string, unknown> | null;

      if (proposal && typeof proposal.proposed_disposition === "string") {
        skipped++;
        continue;
      }

      const userContexts = await db.context.findMany({
        where: { user_id: capture.user_id, deleted_at: null },
        select: { name: true },
      });
      const contextNames = userContexts.map((c) => c.name);

      const userProjects = await db.project.findMany({
        where: { user_id: capture.user_id, deleted_at: null, status: "active" },
        select: { title: true },
        take: 100,
      });
      const projectTitles = userProjects.map((p) => p.title);

      const userRecord = await db.user.findUnique({
        where: { id: capture.user_id },
        select: { timezone: true },
      });
      const timezone = userRecord?.timezone ?? "UTC";

      const tier1 = runTier1(capture.raw_text, {
        userTimezone: timezone,
        projectTitles,
        contextNames,
      });

      const confidence = scoreConfidence(capture.raw_text, tier1);

      const titleFallback =
        tier1.title ??
        (capture.raw_text.slice(0, 80).replace(/\s+/g, " ").trim() || "Untitled");

      const enrichedProposal: ParsedCapture = {
        ...(proposal as unknown as Partial<ParsedCapture>),
        title: (proposal?.title as string | undefined) ?? titleFallback,
        tags: (proposal?.tags as string[] | undefined) ?? tier1.tags,
        contexts:
          (proposal?.contexts as string[] | undefined) ??
          tier1.contexts,
        person_refs:
          (proposal?.person_refs as string[] | undefined) ?? tier1.person_refs,
        entity_refs:
          (proposal?.entity_refs as string[] | undefined) ?? tier1.entity_refs,
        flagged: (proposal?.flagged as boolean | undefined) ?? tier1.flagged,
        parse_tier:
          (proposal?.parse_tier as "local_only" | "local_plus_ai" | "fallback_only" | undefined) ??
          "local_only",
        local_confidence:
          (proposal?.local_confidence as number | undefined) ?? confidence.score,
        basic_parse: (proposal?.basic_parse as boolean | undefined) ?? false,
        proposed_disposition: tier1.proposed_disposition,
        estimated_minutes:
          (proposal?.estimated_minutes as number | undefined) ?? tier1.estimated_minutes,
      };

      await db.capture.update({
        where: { id: capture.id },
        data: {
          parser_proposal: enrichedProposal as unknown as Parameters<
            typeof db.capture.update
          >[0]["data"]["parser_proposal"],
        },
      });

      processed++;

      if (processed % 50 === 0) {
        console.log(`  Processed ${processed} captures so far…`);
      }
    } catch (err) {
      errors++;
      console.error(`  Error processing capture ${capture.id}:`, err);
    }
  }

  console.log("\nBackfill complete.");
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (already enriched): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

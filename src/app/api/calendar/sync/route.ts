import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "calendar/sync/route" });

const USER_RATE_LIMIT_SECONDS = 30;
const userLastSync = new Map<string, number>();

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = Date.now();
  const lastSync = userLastSync.get(user.id) ?? 0;
  if (now - lastSync < USER_RATE_LIMIT_SECONDS * 1000) {
    const retryAfter = Math.ceil((USER_RATE_LIMIT_SECONDS * 1000 - (now - lastSync)) / 1000);
    return NextResponse.json(
      { error: "Rate limited — please wait before syncing again", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  userLastSync.set(user.id, now);

  try {
    const { syncAllCalendarsForUser } = await import("@/core/calendar/sync");
    const result = await syncAllCalendarsForUser(user.id);
    log.info({ userId: user.id, result }, "On-demand calendar sync completed");
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    log.error({ err, userId: user.id }, "On-demand calendar sync failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}

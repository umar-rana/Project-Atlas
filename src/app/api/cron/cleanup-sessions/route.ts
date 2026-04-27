import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredSessions } from "@/core/auth/session";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "cron/cleanup-sessions" });
const IS_DEV = process.env.NODE_ENV === "development";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret && !IS_DEV) {
    log.error("CRON_SECRET is not set in production — rejecting cleanup request");
    return NextResponse.json({ error: "Cleanup endpoint not configured" }, { status: 503 });
  }

  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      log.warn("Unauthorized cleanup-sessions request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const count = await purgeExpiredSessions();
    log.info({ count }, "Session cleanup complete");
    return NextResponse.json({ ok: true, purged: count });
  } catch (err) {
    log.error({ err }, "Session cleanup failed");
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}

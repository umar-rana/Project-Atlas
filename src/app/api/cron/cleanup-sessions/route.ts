import { NextResponse } from "next/server";

// This cron endpoint is now a no-op. Session management is handled by Clerk,
// which manages its own session lifecycle. The route remains to avoid 404s
// from any scheduled callers until they are updated.
export async function POST() {
  return NextResponse.json({
    ok: true,
    message: "Sessions are managed by Clerk; no cleanup needed.",
  });
}

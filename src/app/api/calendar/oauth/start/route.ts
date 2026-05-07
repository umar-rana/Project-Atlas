import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { getCalendarAuthUrl } from "@/core/calendar/google-client";
import { createLogger } from "@/core/logging";
import { getBaseUrl } from "@/core/get-base-url";

const log = createLogger({ module: "calendar/oauth/start" });

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  const baseUrl = getBaseUrl(req);

  if (!clerkId) {
    return NextResponse.redirect(new URL("/sign-in", baseUrl));
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", baseUrl));
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    log.error({}, "SESSION_SECRET not set — cannot generate Calendar OAuth nonce");
    return NextResponse.redirect(
      new URL("/settings?cal_error=config&section=integrations", baseUrl),
    );
  }

  const nonce = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", secret).update(nonce).digest("hex");
  const signedNonce = `${nonce}.${sig}`;

  const authUrl = getCalendarAuthUrl(nonce);

  log.info({ userId: user.id }, "Initiating Google Calendar OAuth flow");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("cal_oauth_nonce", signedNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}

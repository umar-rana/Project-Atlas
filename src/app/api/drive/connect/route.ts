import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { getServerSession } from "@/core/auth/session";
import { getAuthUrl } from "@/core/drive/client";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "drive/connect" });

export async function GET(req: NextRequest) {
  const user = await getServerSession();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    log.error({}, "SESSION_SECRET not set — cannot generate Drive OAuth nonce");
    return NextResponse.redirect(new URL("/settings?drive_error=config", req.url));
  }

  const nonce = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", secret).update(nonce).digest("hex");
  const signedNonce = `${nonce}.${sig}`;

  const authUrl = getAuthUrl(nonce);

  log.info({ userId: user.id }, "Initiating Drive OAuth flow");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("drive_oauth_nonce", signedNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { exchangeCode } from "@/core/drive/client";
import { createLogger } from "@/core/logging";
import { getBaseUrl } from "@/core/get-base-url";

const log = createLogger({ module: "drive/oauth-callback" });

function verifyNonceCookie(signedNonce: string, secret: string): string | null {
  const dotIdx = signedNonce.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const nonce = signedNonce.slice(0, dotIdx);
  const provided = signedNonce.slice(dotIdx + 1);
  if (nonce.length < 32 || provided.length < 32) return null;
  const expected = createHmac("sha256", secret).update(nonce).digest("hex");
  if (provided.length !== expected.length) return null;
  try {
    const ok = timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
    return ok ? nonce : null;
  } catch {
    return null;
  }
}

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

  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    log.warn({ userId: user.id, error }, "Drive OAuth provider error");
    return NextResponse.redirect(new URL("/settings?drive_error=provider", baseUrl));
  }

  const secret = process.env.SESSION_SECRET;
  const signedNonce = req.cookies.get("drive_oauth_nonce")?.value;

  if (!secret || !signedNonce) {
    log.warn({ userId: user.id }, "Drive OAuth nonce cookie missing");
    return NextResponse.redirect(new URL("/settings?drive_error=state_missing", baseUrl));
  }

  const nonce = verifyNonceCookie(signedNonce, secret);
  if (!nonce || nonce !== state) {
    log.warn({ userId: user.id }, "Drive OAuth state mismatch — possible CSRF");
    return NextResponse.redirect(new URL("/settings?drive_error=state_mismatch", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/settings?drive_error=no_code", baseUrl));
  }

  try {
    await exchangeCode(code, user.id);
    const response = NextResponse.redirect(new URL("/settings?drive_linked=1", baseUrl));
    response.cookies.set("drive_oauth_nonce", "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    log.error({ err, userId: user.id }, "Drive OAuth callback failed");
    return NextResponse.redirect(new URL("/settings?drive_error=exchange", baseUrl));
  }
}

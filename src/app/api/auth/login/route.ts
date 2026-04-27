import { NextRequest, NextResponse } from "next/server";
import { buildLoginUrl, type AuthMethod } from "@/core/auth/replit-oidc";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString("hex");
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const rawMethod = req.nextUrl.searchParams.get("method");
  const method: AuthMethod = rawMethod === "magic_link" ? "magic_link" : "google";

  const cookieStore = await cookies();
  cookieStore.set("atlas_oidc_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = await buildLoginUrl(host, state, method);
  return NextResponse.redirect(url);
}

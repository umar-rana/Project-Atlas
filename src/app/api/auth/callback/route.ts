import { NextRequest, NextResponse } from "next/server";
import { handleCallback } from "@/core/auth/replit-oidc";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/core/auth/session";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { cookies } from "next/headers";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "auth/callback" });

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const expectedState = cookieStore.get("atlas_oidc_state")?.value;

    if (!expectedState) {
      return NextResponse.redirect(new URL("/sign-in?error=state_missing", req.url));
    }

    const host = req.headers.get("host") ?? req.nextUrl.host;
    const claims = await handleCallback(host, req.nextUrl, expectedState);

    if (!claims.email) {
      return NextResponse.redirect(new URL("/sign-in?error=no_email", req.url));
    }

    const existingUser = await db.user.findUnique({
      where: { email: claims.email },
    });

    let user;
    if (existingUser) {
      user = await db.user.update({
        where: { id: existingUser.id },
        data: {
          name: existingUser.name ?? (`${claims.firstName ?? ""} ${claims.lastName ?? ""}`.trim() || null),
          image: claims.profileImageUrl ?? existingUser.image,
        },
      });
    } else {
      user = await db.user.create({
        data: {
          id: newId(),
          email: claims.email,
          name: `${claims.firstName ?? ""} ${claims.lastName ?? ""}`.trim() || null,
          image: claims.profileImageUrl ?? null,
          timezone: "UTC",
          date_format: "DD/MM/YYYY",
          time_format: "24h",
          week_start: "monday",
          theme: "dark",
        },
      });

      await logActivity({
        user_id: user.id,
        entity_type: "User",
        entity_id: user.id,
        action: "create",
        after: { email: user.email, name: user.name },
      });
    }

    const token = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined,
    });

    const response = NextResponse.redirect(new URL("/tasks?welcome=1", req.url));
    response.cookies.set(SESSION_COOKIE_NAME(), token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE(),
      path: "/",
    });
    response.cookies.delete("atlas_oidc_state");

    log.info({ userId: user.id, email: user.email }, "User signed in");
    return response;
  } catch (err) {
    log.error({ err }, "Auth callback failed");
    return NextResponse.redirect(new URL("/sign-in?error=callback_failed", req.url));
  }
}

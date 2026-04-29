import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/privacy(.*)",
  "/terms(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth/test-login(.*)",
  "/api/drive/connect(.*)",
  "/api/drive/oauth-callback(.*)",
  "/api/health(.*)",
  "/api/trpc/health.ping(.*)",
  "/api/cron/(.*)",
]);

const MOBILE_UA_RE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isMobileRequest(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  return MOBILE_UA_RE.test(ua);
}

const STATIC_ASSET_RE = /\.[a-zA-Z0-9]+$/;

const MOBILE_ROUTE_MAP: Array<{ prefix: string; mobilePath: string }> = [
  { prefix: "/tasks", mobilePath: "/m/tasks" },
  { prefix: "/calendar", mobilePath: "/m/calendar" },
  { prefix: "/notes", mobilePath: "/m/notes" },
  { prefix: "/journals", mobilePath: "/m/journals" },
  { prefix: "/settings", mobilePath: "/m/settings" },
];

function toMobilePath(pathname: string): string | null {
  if (pathname === "/" || pathname === "") return "/m/tasks";
  for (const { prefix, mobilePath } of MOBILE_ROUTE_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return mobilePath;
    }
  }
  return null;
}

function shouldRedirectToMobile(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  if (pathname === "/") return false;
  if (pathname.startsWith("/m")) return false;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return false;
  if (pathname.startsWith("/privacy") || pathname.startsWith("/terms")) return false;
  if (STATIC_ASSET_RE.test(pathname)) return false;
  if (req.cookies.get("prefer-desktop")?.value === "1") return false;
  return isMobileRequest(req);
}

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("from", req.nextUrl.pathname);
      return NextResponse.redirect(signIn);
    }
  }

  if (shouldRedirectToMobile(req)) {
    const mobilePath = toMobilePath(req.nextUrl.pathname);
    if (mobilePath) {
      return NextResponse.redirect(new URL(mobilePath, req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|storybook).*)",
  ],
};

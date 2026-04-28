import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth/test-login(.*)",
  "/api/drive/connect(.*)",
  "/api/drive/oauth-callback(.*)",
  "/api/health(.*)",
  "/api/trpc/health.ping(.*)",
  "/api/cron/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("from", req.nextUrl.pathname);
      return NextResponse.redirect(signIn);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|storybook).*)",
  ],
};

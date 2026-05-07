import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const PARAM_PATTERN = /^[A-Za-z0-9_-]+$/;

const GIST_CSP = [
  "default-src 'none'",
  "script-src https://gist.github.com",
  "style-src 'unsafe-inline' https://github.githubassets.com",
  "img-src https://github.githubassets.com https://avatars.githubusercontent.com",
  "connect-src 'none'",
  "frame-ancestors 'self'",
].join("; ");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const user = searchParams.get("user");
  const id = searchParams.get("id");

  if (!user || !id || !PARAM_PATTERN.test(user) || !PARAM_PATTERN.test(id)) {
    return new NextResponse("Invalid gist parameters", { status: 400 });
  }

  const scriptSrc = `https://gist.github.com/${user}/${id}.js`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ui-monospace, monospace; background: transparent; }
  .gist { overflow: auto; }
</style>
</head>
<body>
<script src="${scriptSrc}"></script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": GIST_CSP,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
}

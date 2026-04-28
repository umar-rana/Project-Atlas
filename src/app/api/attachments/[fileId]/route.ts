import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { getFileUrl } from "@/core/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  try {
    const { url } = await getFileUrl({
      userId: user.id,
      fileId,
      expiresInSeconds: 3600,
    });

    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found") || message.includes("access denied")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

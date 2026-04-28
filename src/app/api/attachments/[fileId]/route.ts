import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/core/db";
import { getFile } from "@/core/storage";

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
    const { data, contentType, filename } = await getFile({
      userId: user.id,
      fileId,
    });

    const safeFilename = encodeURIComponent(filename);
    return new NextResponse(Buffer.from(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${safeFilename}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found") || message.includes("access denied")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

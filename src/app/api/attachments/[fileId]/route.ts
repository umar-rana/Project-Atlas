import { NextRequest, NextResponse } from "next/server";
import { getServerSessionInfo } from "@/core/auth/session";
import { getFile } from "@/core/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const session = await getServerSessionInfo();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  try {
    const { data, contentType, filename } = await getFile({
      userId: session.user.id,
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

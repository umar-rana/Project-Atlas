import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { complete } from "@/core/ai";

export async function GET(req: NextRequest) {
  const user = await getServerSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prompt = req.nextUrl.searchParams.get("prompt") ?? "Say hello in one sentence.";

  try {
    const result = await complete({
      task: "test",
      prompt,
      userId: user.id,
    });

    return NextResponse.json({
      content: result.content,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

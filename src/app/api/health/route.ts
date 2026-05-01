import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkStorageHealth } from "@/core/storage";
import Anthropic from "@anthropic-ai/sdk";
import { fireHealthAlert } from "@/core/alerts";

async function checkDb(): Promise<{ ok: boolean }> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function checkStorage(): Promise<{ ok: boolean; provider?: string }> {
  try {
    const result = await checkStorageHealth();
    return { ok: result.ok, provider: result.provider };
  } catch {
    return { ok: false };
  }
}

async function checkAI(): Promise<{ ok: boolean; latencyMs?: number; message?: string }> {
  const start = Date.now();
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, latencyMs: 0, message: "API key not configured" };
  }
  try {
    const client = new Anthropic({
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? undefined,
      apiKey,
    });
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    }, { timeout: 8000 });
    const latencyMs = Date.now() - start;
    const ok = message.content.length > 0;
    return { ok, latencyMs };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "AI check failed",
    };
  }
}

async function checkDrive(): Promise<{ ok: boolean; message?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, message: "Google OAuth env vars not configured" };
  }

  try {
    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, message: `Google API unreachable (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Drive check failed",
    };
  }
}

export async function GET() {
  const [dbResult, storageResult, aiResult, driveResult] = await Promise.all([
    checkDb(),
    checkStorage(),
    checkAI(),
    checkDrive(),
  ]);

  const criticalOk = dbResult.ok && storageResult.ok && aiResult.ok;
  const ts = new Date().toISOString();

  const failedChecks = [
    !dbResult.ok && "database",
    !storageResult.ok && "storage",
    !aiResult.ok && "AI",
  ].filter(Boolean);

  void fireHealthAlert({
    ok: criticalOk,
    db: dbResult.ok,
    ts,
    reason: failedChecks.length > 0 ? `Failed checks: ${failedChecks.join(", ")}` : undefined,
  });

  const body = {
    ok: criticalOk,
    db: dbResult.ok,
    storage: storageResult,
    ai: aiResult,
    drive: driveResult,
    ts,
  };

  return NextResponse.json(body, { status: criticalOk ? 200 : 503 });
}

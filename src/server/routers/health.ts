import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { checkStorageHealth } from "@/core/storage";
import { verifyDriveConfig } from "@/core/drive/linking";
import { isQueueHealthy, getDeadLetterCount } from "@/core/queue";
import { logger, createLogger } from "@/core/logging";
import { complete } from "@/core/ai";

const log = createLogger({ module: "health" });

type CheckResult = {
  ok: boolean;
  message?: string;
  latencyMs?: number;
};

async function checkAI(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const result = await complete({
      task: "test",
      prompt: "ping",
      userId: "health-check",
      options: { maxTokens: 8 },
    });
    const latencyMs = Date.now() - start;
    const ok = result.content.length > 0;
    return { ok, latencyMs, message: ok ? undefined : "Empty response from AI" };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "AI check failed",
    };
  }
}

async function checkTRPC(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const port = process.env.PORT ?? "5000";
    const res = await fetch(`http://localhost:${port}/api/trpc/health.ping`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { ok: false, latencyMs, message: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { result?: { data?: { pong?: boolean } } };
    const pong = body?.result?.data?.pong === true;
    return { ok: pong, latencyMs, message: pong ? undefined : "No pong in response" };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "tRPC check failed",
    };
  }
}

async function checkClerk(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.clerk.com/v1/jwks", {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { ok: false, latencyMs, message: `Clerk JWKS HTTP ${res.status}` };
    }
    return { ok: true, latencyMs };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Clerk check failed",
    };
  }
}

export const healthRouter = router({
  ping: publicProcedure.query(() => ({ pong: true, ts: new Date().toISOString() })),

  full: publicProcedure.query(async ({ ctx }) => {
    const checks: Record<string, CheckResult> = {};

    const userId = ctx.user?.id;

    const safeCheck = async <T>(
      name: string,
      fn: () => Promise<T>,
    ): Promise<{ result: T | null; ms: number }> => {
      const start = Date.now();
      try {
        const result = await fn();
        return { result, ms: Date.now() - start };
      } catch (err) {
        log.warn({ err, check: name }, "Health check threw unexpectedly");
        return { result: null, ms: Date.now() - start };
      }
    };

    const [dbCheck, storageCheck, driveCheck, aiCheck, trpcCheck, clerkCheck] = await Promise.all([
      safeCheck("database", async () => {
        try {
          await db.$queryRaw`SELECT 1`;
          return true;
        } catch {
          return false;
        }
      }),
      safeCheck("storage", checkStorageHealth),
      userId
        ? safeCheck("drive", () => verifyDriveConfig(userId))
        : Promise.resolve({ result: { ok: false as boolean, reason: "Not authenticated" }, ms: 0 }),
      safeCheck("ai", checkAI),
      safeCheck("trpc", checkTRPC),
      safeCheck("clerk", checkClerk),
    ]);

    checks.database = { ok: dbCheck.result ?? false, latencyMs: dbCheck.ms };
    const storageResult = storageCheck.result;
    checks.object_storage = {
      ok: storageResult?.ok ?? false,
      message: storageResult ? `provider: ${storageResult.provider}` : "Storage check failed",
      latencyMs: storageCheck.ms,
    };
    checks.logging = { ok: typeof logger !== "undefined" && !!logger };
    checks.queue = {
      ok: isQueueHealthy(),
      message: isQueueHealthy() ? undefined : `${getDeadLetterCount()} dead-letter items`,
    };
    checks.drive = driveCheck.result
      ? { ok: driveCheck.result.ok, message: driveCheck.result.reason, latencyMs: driveCheck.ms }
      : { ok: false, message: "Drive check failed", latencyMs: driveCheck.ms };
    checks.ai = aiCheck.result
      ? {
          ok: aiCheck.result.ok,
          message: aiCheck.result.message,
          latencyMs: aiCheck.result.latencyMs,
        }
      : { ok: false, message: "AI check threw", latencyMs: aiCheck.ms };
    checks.trpc = trpcCheck.result
      ? {
          ok: trpcCheck.result.ok,
          message: trpcCheck.result.message,
          latencyMs: trpcCheck.result.latencyMs,
        }
      : { ok: false, message: "tRPC check threw", latencyMs: trpcCheck.ms };
    checks.clerk = clerkCheck.result
      ? {
          ok: clerkCheck.result.ok,
          message: clerkCheck.result.ok ? undefined : clerkCheck.result.message,
          latencyMs: clerkCheck.result.latencyMs,
        }
      : { ok: false, message: "Clerk check threw", latencyMs: clerkCheck.ms };

    if (ctx.user) {
      const { result: user, ms: authMs } = await safeCheck("auth", async () => {
        return await db.user.findUnique({
          where: { id: ctx.user!.id },
          select: { id: true, email: true },
        });
      });
      checks.auth = {
        ok: !!user,
        message: user
          ? `Clerk user ${(user as { email: string }).email} verified in DB`
          : "Clerk user not found in DB",
        latencyMs: authMs,
      };
    } else {
      checks.auth = { ok: false, message: "No active session" };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    return { ok: allOk, checks, checkedAt: new Date().toISOString() };
  }),
});

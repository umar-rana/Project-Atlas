import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { checkStorageHealth } from "@/core/storage";
import { verifyDriveConfig } from "@/core/drive/linking";
import { isQueueHealthy, getDeadLetterCount } from "@/core/queue";
import { logger, createLogger } from "@/core/logging";
import { complete } from "@/core/ai";
import { getOidcConfig } from "@/core/auth/replit-oidc";
import { z } from "zod";

const log = createLogger({ module: "health/oidc" });

const CheckResult = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  latencyMs: z.number().optional(),
});

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

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
    const body = await res.json() as { result?: { data?: { pong?: boolean } } };
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

export const healthRouter = router({
  ping: publicProcedure.query(() => ({ pong: true, ts: new Date().toISOString() })),

  full: publicProcedure.query(async ({ ctx }) => {
    const checks: Record<string, z.infer<typeof CheckResult>> = {};

    const userId = ctx.user?.id;

    const [dbCheck, storageCheck, driveCheck, aiCheck, trpcCheck, oidcCheck] = await Promise.all([
      timed(async () => {
        try {
          await db.$queryRaw`SELECT 1`;
          return true;
        } catch {
          return false;
        }
      }),
      timed(checkStorageHealth),
      userId
        ? timed(() => verifyDriveConfig(userId))
        : Promise.resolve({ result: { ok: false, reason: "Not authenticated" }, ms: 0 }),
      timed(checkAI),
      timed(checkTRPC),
      timed(async () => {
        const start = Date.now();
        try {
          await getOidcConfig();
          return { ok: true as const, latencyMs: Date.now() - start };
        } catch (err) {
          const message = err instanceof Error ? err.message : "OIDC discovery failed";
          log.error({ err }, "OIDC health check failed");
          return { ok: false as const, message, latencyMs: Date.now() - start };
        }
      }),
    ]);

    checks.database = { ok: dbCheck.result, latencyMs: dbCheck.ms };
    checks.object_storage = { ok: storageCheck.result, latencyMs: storageCheck.ms };
    checks.logging = { ok: typeof logger !== "undefined" && !!logger };
    checks.queue = {
      ok: isQueueHealthy(),
      message: isQueueHealthy() ? undefined : `${getDeadLetterCount()} dead-letter items`,
    };
    checks.drive = {
      ok: driveCheck.result.ok,
      message: driveCheck.result.reason,
      latencyMs: driveCheck.ms,
    };
    checks.ai = {
      ok: aiCheck.result.ok,
      message: aiCheck.result.message,
      latencyMs: aiCheck.result.latencyMs,
    };
    checks.trpc = {
      ok: trpcCheck.result.ok,
      message: trpcCheck.result.message,
      latencyMs: trpcCheck.result.latencyMs,
    };
    checks.oidc = {
      ok: oidcCheck.result.ok,
      message: oidcCheck.result.ok ? undefined : oidcCheck.result.message,
      latencyMs: oidcCheck.result.latencyMs,
    };

    if (ctx.user) {
      const { result: user, ms: authMs } = await timed(async () => {
        try {
          return await db.user.findUnique({
            where: { id: ctx.user!.id },
            select: { id: true, email: true },
          });
        } catch {
          return null;
        }
      });
      checks.auth = {
        ok: !!user,
        message: user ? `Session user ${user.email} verified in DB` : "Session user not found in DB",
        latencyMs: authMs,
      };
    } else {
      checks.auth = { ok: false, message: "No active session" };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    return { ok: allOk, checks, checkedAt: new Date().toISOString() };
  }),
});

import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "ai-limits" });

export const CAPTURE_PARSE_MODEL = "claude-haiku-4-5";

export const CAPTURE_PARSE_LIMITS = {
  maxInputTokens: 2000,
  maxOutputTokens: 500,
  hourlyCallsPerUser: 30,
  dailyCallsPerUser: 200,
  dailyCostUsdHardCap: 1.0,
  dailyCostUsdSoftAlert: 0.5,
} as const;

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkCaptureParseLimits(userId: string): Promise<LimitCheckResult> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  try {
    const [hourlyCount, dailyAgg] = await Promise.all([
      db.aICallLog.count({
        where: {
          user_id: userId,
          task: { startsWith: "capture_parse" },
          created_at: { gte: oneHourAgo },
          success: true,
        },
      }),
      db.aICallLog.aggregate({
        where: {
          user_id: userId,
          task: { startsWith: "capture_parse" },
          created_at: { gte: dayStart },
        },
        _count: { id: true },
        _sum: { cost_usd: true },
      }),
    ]);

    if (hourlyCount >= CAPTURE_PARSE_LIMITS.hourlyCallsPerUser) {
      return {
        allowed: false,
        reason: `Hourly capture AI limit reached (${hourlyCount}/${CAPTURE_PARSE_LIMITS.hourlyCallsPerUser})`,
      };
    }

    const dailyCount = dailyAgg._count.id ?? 0;
    if (dailyCount >= CAPTURE_PARSE_LIMITS.dailyCallsPerUser) {
      return {
        allowed: false,
        reason: `Daily capture AI limit reached (${dailyCount}/${CAPTURE_PARSE_LIMITS.dailyCallsPerUser})`,
      };
    }

    const dailyCost = dailyAgg._sum.cost_usd ?? 0;
    if (dailyCost >= CAPTURE_PARSE_LIMITS.dailyCostUsdHardCap) {
      return {
        allowed: false,
        reason: `Daily AI cost cap reached ($${dailyCost.toFixed(4)})`,
      };
    }

    if (dailyCost >= CAPTURE_PARSE_LIMITS.dailyCostUsdSoftAlert) {
      log.warn({ userId, dailyCost }, "Capture AI daily cost approaching hard cap");
    }

    return { allowed: true };
  } catch (err) {
    log.warn({ err, userId }, "Limit check failed — allowing request");
    return { allowed: true };
  }
}

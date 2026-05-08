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

export const HELP_CHAT_LIMITS = {
  hourlyCallsPerUser: 30,
  dailyCallsPerUser: 100,
  dailyCostUsdHardCap: 0.5,
  dailyCostUsdSoftAlert: 0.25,
} as const;

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
}

interface AILimitConfig {
  taskLabel: string;
  taskFilter: { startsWith: string } | { equals: string };
  hourlyCallsPerUser: number;
  dailyCallsPerUser: number;
  dailyCostUsdHardCap: number;
  dailyCostUsdSoftAlert: number;
}

async function checkAILimits(userId: string, config: AILimitConfig): Promise<LimitCheckResult> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  try {
    const [hourlyCount, dailyAgg] = await Promise.all([
      db.aICallLog.count({
        where: {
          user_id: userId,
          task: config.taskFilter,
          created_at: { gte: oneHourAgo },
          success: true,
        },
      }),
      db.aICallLog.aggregate({
        where: {
          user_id: userId,
          task: config.taskFilter,
          created_at: { gte: dayStart },
        },
        _count: { id: true },
        _sum: { cost_usd: true },
      }),
    ]);

    if (hourlyCount >= config.hourlyCallsPerUser) {
      return {
        allowed: false,
        reason: `Hourly ${config.taskLabel} AI limit reached (${hourlyCount}/${config.hourlyCallsPerUser})`,
      };
    }

    const dailyCount = dailyAgg._count.id ?? 0;
    if (dailyCount >= config.dailyCallsPerUser) {
      return {
        allowed: false,
        reason: `Daily ${config.taskLabel} AI limit reached (${dailyCount}/${config.dailyCallsPerUser})`,
      };
    }

    const dailyCost = Number(dailyAgg._sum.cost_usd ?? 0);
    if (dailyCost >= config.dailyCostUsdHardCap) {
      return {
        allowed: false,
        reason: `Daily ${config.taskLabel} AI cost cap reached ($${dailyCost.toFixed(4)})`,
      };
    }

    if (dailyCost >= config.dailyCostUsdSoftAlert) {
      log.warn({ userId, dailyCost, task: config.taskLabel }, "AI daily cost approaching hard cap");
    }

    return { allowed: true };
  } catch (err) {
    log.warn({ err, userId, task: config.taskLabel }, "Limit check failed — allowing request");
    return { allowed: true };
  }
}

export async function checkCaptureParseLimits(userId: string): Promise<LimitCheckResult> {
  return checkAILimits(userId, {
    taskLabel: "capture",
    taskFilter: { startsWith: "capture_parse" },
    hourlyCallsPerUser: CAPTURE_PARSE_LIMITS.hourlyCallsPerUser,
    dailyCallsPerUser: CAPTURE_PARSE_LIMITS.dailyCallsPerUser,
    dailyCostUsdHardCap: CAPTURE_PARSE_LIMITS.dailyCostUsdHardCap,
    dailyCostUsdSoftAlert: CAPTURE_PARSE_LIMITS.dailyCostUsdSoftAlert,
  });
}

export async function checkHelpChatLimits(userId: string): Promise<LimitCheckResult> {
  return checkAILimits(userId, {
    taskLabel: "help_chat",
    taskFilter: { equals: "help_chat" },
    hourlyCallsPerUser: HELP_CHAT_LIMITS.hourlyCallsPerUser,
    dailyCallsPerUser: HELP_CHAT_LIMITS.dailyCallsPerUser,
    dailyCostUsdHardCap: HELP_CHAT_LIMITS.dailyCostUsdHardCap,
    dailyCostUsdSoftAlert: HELP_CHAT_LIMITS.dailyCostUsdSoftAlert,
  });
}

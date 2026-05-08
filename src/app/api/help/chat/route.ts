import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { HELP_DOCS_CORPUS } from "@/lib/help/docs";
import { completeStream } from "@/core/ai";
import { checkHelpChatLimits } from "@/core/ai/limits";
import { logActivity } from "@/core/audit";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "api/help/chat" });

const SYSTEM_PROMPT = `You are the Atlas Help Assistant — a friendly, knowledgeable guide for Atlas, a unified productivity workspace.

Your job is to help users understand how Atlas works, answer questions about features, explain workflows, and troubleshoot common issues.

You have access to the full Atlas documentation below. Use it to give accurate, helpful answers.

Guidelines:
- Be concise and direct. Prefer short answers unless the user asks for detail.
- Use markdown formatting when it helps clarity (lists, bold, code blocks for shortcuts).
- If you don't know something or it's outside Atlas's current feature set, say so clearly.
- Never make up features that don't exist. Stick to what's in the documentation.
- For billing, account, or support issues, direct users to the Atlas support team.

--- ATLAS DOCUMENTATION ---

${HELP_DOCS_CORPUS}

--- END DOCUMENTATION ---`;

// In-memory rate limiter: 20 requests per minute per user.
// Known limitation: does not survive process restarts; tracked for a future
// Redis-backed rate limiting sprint (audit SO-3).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= RATE_LIMIT) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}

// Maximum number of conversation turns sent to Anthropic.
// Truncating to the last 20 entries prevents replay-style cost amplification
// on very long conversations.
const MAX_HISTORY_TURNS = 20;

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Rate-limit by Clerk ID (available before the DB lookup)
  const { allowed, retryAfterSec } = checkRateLimit(`help_chat:${clerkId}`);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Maximum 20 requests per minute." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  // Resolve Clerk ID to internal User.id (UUID) so AICallLog and AuditLog
  // foreign keys are correct and usage queries work as expected.
  const user = await db.user.findUnique({
    where: { clerk_id: clerkId },
    select: { id: true },
  });
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const internalUserId = user.id;

  // Per-user daily/hourly call + cost cap. Persistent across process restarts
  // since it queries AICallLog. The 20/min in-memory limiter above guards
  // bursts; this guards sustained-cost abuse (audit H-SEC-1).
  const limitCheck = await checkHelpChatLimits(internalUserId);
  if (!limitCheck.allowed) {
    log.warn({ userId: internalUserId, reason: limitCheck.reason }, "help_chat limit exceeded");
    return new Response(
      JSON.stringify({ error: limitCheck.reason ?? "AI usage limit reached" }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let body: { messages?: { role: string; content: string }[]; query?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  let messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    if (body.query) {
      messages = [{ role: "user", content: body.query }];
    } else {
      return new Response(JSON.stringify({ error: "messages or query required" }), { status: 400 });
    }
  }

  // Truncate to last MAX_HISTORY_TURNS entries before sending to Anthropic to
  // prevent replay-style cost amplification on long conversations.
  const truncated = messages.slice(-MAX_HISTORY_TURNS);

  const anthropicMessages = truncated.map((m) => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  const chatId = newId();

  const stream = completeStream({
    task: "help_chat",
    systemPrompt: SYSTEM_PROMPT,
    messages: anthropicMessages,
    userId: internalUserId,
    maxTokens: 1024,
    onComplete: async (result) => {
      await logActivity({
        user_id: internalUserId,
        entity_type: "HelpChat",
        entity_id: chatId,
        action: "help_chat_message",
        meta: {
          model: result.model,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_usd: result.costUsd,
        },
      }).catch((err) => {
        log.warn({ err }, "Failed to write HelpChat audit log");
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

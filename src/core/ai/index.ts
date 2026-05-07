import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { enqueue } from "@/core/queue";

const log = createLogger({ module: "ai" });

type ModelId = "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7";

const TASK_MODEL_MAP: Record<string, ModelId> = {
  test: "claude-haiku-4-5",
  capture_parse: "claude-haiku-4-5",
  capture_parse_v2: "claude-haiku-4-5",
  help_chat: "claude-haiku-4-5",
  default: "claude-haiku-4-5",
};

const INPUT_COST_PER_TOKEN: Record<ModelId, number> = {
  "claude-haiku-4-5": 0.00000025,
  "claude-sonnet-4-6": 0.000003,
  "claude-opus-4-7": 0.000015,
};
const OUTPUT_COST_PER_TOKEN: Record<ModelId, number> = {
  "claude-haiku-4-5": 0.00000125,
  "claude-sonnet-4-6": 0.000015,
  "claude-opus-4-7": 0.000075,
};

function getClient(): Anthropic {
  return new Anthropic({
    baseURL:
      process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? undefined,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  });
}

export interface CompleteOptions {
  task: string;
  prompt: string;
  context?: string;
  userId?: string;
  options?: {
    maxTokens?: number;
    systemPrompt?: string;
    model?: ModelId;
  };
}

export interface CompleteResult {
  content: string;
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface CompleteStreamOptions {
  task: string;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  userId?: string;
  maxTokens?: number;
  model?: ModelId;
  onComplete?: (result: CompleteResult) => Promise<void>;
}

/**
 * Streams a response from Anthropic while writing an AICallLog row on
 * completion.  The caller receives a ReadableStream that yields raw text
 * chunks exactly as the existing /api/help/chat route did before.
 *
 * Cost and token data flow through to AICallLog so the call appears on
 * /usage and counts against ai_budget_usd.  An optional onComplete
 * callback lets callers write additional records (e.g. AuditLog) once
 * usage figures are known.
 */
export function completeStream(opts: CompleteStreamOptions): ReadableStream<Uint8Array> {
  const model: ModelId =
    opts.model ?? ((TASK_MODEL_MAP[opts.task] ?? TASK_MODEL_MAP["default"]) as ModelId);
  const maxTokens = opts.maxTokens ?? 1024;
  const start = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const client = getClient();
        const sdkStream = await client.messages.stream({
          model,
          max_tokens: maxTokens,
          system: opts.systemPrompt,
          messages: opts.messages,
        });

        for await (const chunk of sdkStream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }

        const finalMessage = await sdkStream.finalMessage();
        const durationMs = Date.now() - start;
        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;
        const costUsd =
          inputTokens * INPUT_COST_PER_TOKEN[model] + outputTokens * OUTPUT_COST_PER_TOKEN[model];
        const content =
          finalMessage.content[0]?.type === "text" ? finalMessage.content[0].text : "";

        try {
          await db.aICallLog.create({
            data: {
              id: newId(),
              user_id: opts.userId ?? null,
              task: opts.task,
              model,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_usd: costUsd,
              duration_ms: durationMs,
              success: true,
            },
          });
        } catch (logErr) {
          log.warn({ logErr }, "Failed to write AICallLog for streamed response");
        }

        log.info(
          { task: opts.task, model, inputTokens, outputTokens, costUsd, durationMs },
          "AI stream completed",
        );

        if (opts.onComplete) {
          try {
            await opts.onComplete({ content, model, inputTokens, outputTokens, costUsd, durationMs });
          } catch (cbErr) {
            log.warn({ cbErr }, "onComplete callback failed");
          }
        }

        controller.close();
      } catch (err) {
        const durationMs = Date.now() - start;
        try {
          await db.aICallLog.create({
            data: {
              id: newId(),
              user_id: opts.userId ?? null,
              task: opts.task,
              model,
              input_tokens: 0,
              output_tokens: 0,
              cost_usd: 0,
              duration_ms: durationMs,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        } catch (logErr) {
          log.warn({ logErr }, "Failed to log AI stream failure to DB");
        }
        log.error({ err, task: opts.task, model, durationMs }, "AI stream failed");
        controller.error(err);
      }
    },
  });

  return stream;
}

export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const model: ModelId =
    opts.options?.model ?? ((TASK_MODEL_MAP[opts.task] ?? TASK_MODEL_MAP["default"]) as ModelId);
  const maxTokens = opts.options?.maxTokens ?? 1024;
  const start = Date.now();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: opts.context ? `Context:\n${opts.context}\n\n${opts.prompt}` : opts.prompt,
    },
  ];

  try {
    return await enqueue<CompleteResult>({
      id: newId(),
      priority: "USER",
      provider: "claude_via_replit",
      userId: opts.userId ?? "system",
      execute: async () => {
        const client = getClient();

        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: opts.options?.systemPrompt ?? "You are Atlas, a helpful productivity assistant.",
          messages,
        });

        const durationMs = Date.now() - start;
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const costUsd =
          inputTokens * INPUT_COST_PER_TOKEN[model] + outputTokens * OUTPUT_COST_PER_TOKEN[model];
        const content = response.content[0]?.type === "text" ? response.content[0].text : "";

        await db.aICallLog.create({
          data: {
            id: newId(),
            user_id: opts.userId ?? null,
            task: opts.task,
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: costUsd,
            duration_ms: durationMs,
            success: true,
          },
        });

        log.info(
          { task: opts.task, model, inputTokens, outputTokens, costUsd, durationMs },
          "AI call completed",
        );

        return { content, model, inputTokens, outputTokens, costUsd, durationMs };
      },
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    try {
      await db.aICallLog.create({
        data: {
          id: newId(),
          user_id: opts.userId ?? null,
          task: opts.task,
          model,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          duration_ms: durationMs,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    } catch (logErr) {
      log.warn({ logErr }, "Failed to log AI failure to DB");
    }
    log.error({ err, task: opts.task, model, durationMs }, "AI call failed");
    throw err;
  }
}

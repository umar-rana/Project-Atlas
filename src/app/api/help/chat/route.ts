import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { HELP_DOCS_CORPUS } from "@/lib/help/docs";

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

function getClient(): Anthropic {
  return new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? undefined,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
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

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const client = getClient();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sdkStream = await client.messages.stream({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages,
        });

        for await (const chunk of sdkStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
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

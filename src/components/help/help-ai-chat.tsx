"use client";

import * as React from "react";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_PROMPTS = [
  "How do I set up a weekly review workflow?",
  "What's the difference between a project and a task?",
  "How do keyboard shortcuts work?",
  "How do I use backlinks in notes?",
  "What is the Waiting For context used for?",
];

function ThinkingDots(): React.ReactElement {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-text-tertiary"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export function HelpAIChat(): React.ReactElement {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to get response");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-ui text-sm font-semibold text-text-primary">Ask AI</span>
          <span className="rounded bg-accent-primary-subtle px-1.5 py-0.5 font-mono text-2xs text-accent-primary">
            Beta
          </span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 rounded px-2 py-1 font-ui text-xs text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
          >
            <X size={12} aria-hidden />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent-primary-subtle">
              <span className="font-mono text-lg text-accent-primary">✦</span>
            </div>
            <div className="text-center">
              <p className="font-ui text-sm font-medium text-text-primary">How can I help you?</p>
              <p className="mt-1 font-ui text-xs text-text-tertiary">Ask anything about Atlas</p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-left font-ui text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
              >
                {msg.role === "assistant" && (
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-primary-subtle font-mono text-xs text-accent-primary">
                    ✦
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-3 py-2 font-ui text-sm leading-relaxed",
                    msg.role === "user"
                      ? "ml-auto bg-[var(--color-bg-elevated,theme(colors.neutral.800))] text-text-primary"
                      : "bg-surface-subtle text-text-secondary",
                  )}
                >
                  {msg.content || (loading && i === messages.length - 1 ? <ThinkingDots /> : "")}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="flex gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-primary-subtle font-mono text-xs text-accent-primary">
                  ✦
                </div>
                <div className="bg-surface-subtle rounded-xl px-3 py-2">
                  <ThinkingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle p-4">
        <div className="focus-within:ring-accent-primary/30 flex items-end gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 focus-within:border-accent-primary focus-within:ring-1">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Atlas…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none bg-transparent font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
            style={{ maxHeight: "120px" }}
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary text-white transition-opacity disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={13} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-center font-ui text-2xs text-text-tertiary">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

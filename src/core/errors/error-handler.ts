import { TRPCClientError } from "@trpc/client";

const CODE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "You need to be signed in to do that.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "That item no longer exists.",
  BAD_REQUEST: "The request couldn't be completed — please check your input.",
  CONFLICT: "This action conflicts with existing data.",
  TOO_MANY_REQUESTS: "Too many requests — please slow down and try again.",
  INTERNAL_SERVER_ERROR: "Something went wrong on our end. Please try again.",
  TIMEOUT: "The request took too long. Please try again.",
  METHOD_NOT_SUPPORTED: "That action is not supported.",
  PRECONDITION_FAILED: "Some required conditions weren't met.",
  PAYLOAD_TOO_LARGE: "The data you're sending is too large.",
  UNPROCESSABLE_CONTENT: "The content couldn't be processed. Please check your input.",
  NOT_IMPLEMENTED: "This feature isn't available yet.",
};

function isJsonParseError(message: string): boolean {
  return (
    message.includes("Unexpected token") ||
    message.includes("JSON.parse") ||
    message.includes("Unexpected end of JSON") ||
    message.includes("is not valid JSON") ||
    message.includes("SyntaxError")
  );
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network request failed") ||
      msg.includes("networkerror") ||
      msg.includes("load failed")
    );
  }
  return false;
}

export function handleTrpcError(error: unknown): string {
  if (isNetworkError(error)) {
    return "Connection problem — check your internet and try again.";
  }

  if (error instanceof TRPCClientError) {
    const code = error.data?.code as string | undefined;

    if (code && code in CODE_MESSAGES) {
      // For codes that carry an actionable server-side message, prefer
      // that over the generic fallback. CONFLICT was added in CP-1 so
      // disposition processing surfaces "This capture has already been
      // processed" instead of the vague "conflicts with existing data".
      if (code === "BAD_REQUEST" || code === "NOT_FOUND" || code === "CONFLICT") {
        const msg = error.message;
        if (msg && !isJsonParseError(msg) && msg.length < 200) {
          return msg;
        }
      }
      return CODE_MESSAGES[code]!;
    }

    const msg = error.message;
    if (msg && isJsonParseError(msg)) {
      return "Something went wrong on our end. Please try again.";
    }
    if (msg && msg.length < 200 && !msg.toLowerCase().includes("internal")) {
      return msg;
    }
  }

  const msg = (error as { message?: string })?.message ?? "";
  if (msg && isJsonParseError(msg)) {
    return "Something went wrong on our end. Please try again.";
  }
  if (msg && msg.length < 200 && !msg.toLowerCase().includes("internal server")) {
    return msg;
  }

  return "Something went wrong. Please try again.";
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 300,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const code = (err as { data?: { code?: string } })?.data?.code;
      if (
        code === "UNAUTHORIZED" ||
        code === "FORBIDDEN" ||
        code === "NOT_FOUND" ||
        code === "BAD_REQUEST"
      ) {
        throw err;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

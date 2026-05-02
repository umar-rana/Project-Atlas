"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { handleTrpcError } from "@/core/errors/error-handler";

async function safeFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok && !contentType.includes("application/json")) {
    const fakeBody = JSON.stringify([
      {
        error: {
          message: "Internal server error",
          code: -32603,
          data: { code: "INTERNAL_SERVER_ERROR", httpStatus: response.status },
        },
      },
    ]);
    return new Response(fakeBody, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return response;
}

function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.meta?.suppressGlobalError) return;
        const code = (error as { data?: { code?: string } })?.data?.code;
        if (code === "UNAUTHORIZED") return;
        const message = handleTrpcError(error);
        toast.error(message, { duration: 6000 });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: (count, error) => {
          if ((error as { data?: { code?: string } })?.data?.code === "UNAUTHORIZED") return false;
          return count < 2;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({ url: "/api/trpc", fetch: safeFetch }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

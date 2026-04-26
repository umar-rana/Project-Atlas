// Atlas — Wave 0 tRPC server placeholder.
// Wave 2 introduces the real router, context, and procedures.

import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({});

export type AppRouter = typeof appRouter;

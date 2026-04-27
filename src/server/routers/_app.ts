import { router } from "@/server/trpc";
import { healthRouter } from "./health";
import { userRouter } from "./user";
import { driveRouter } from "./drive";
import { aiRouter } from "./ai";

export const appRouter = router({
  health: healthRouter,
  user: userRouter,
  drive: driveRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;

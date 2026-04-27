import { router } from "@/server/trpc";
import { healthRouter } from "./health";
import { userRouter } from "./user";
import { driveRouter } from "./drive";
import { aiRouter } from "./ai";
import { captureRouter } from "./capture";

export const appRouter = router({
  health: healthRouter,
  user: userRouter,
  drive: driveRouter,
  ai: aiRouter,
  capture: captureRouter,
});

export type AppRouter = typeof appRouter;

import { router } from "@/server/trpc";
import { healthRouter } from "./health";
import { userRouter } from "./user";
import { driveRouter } from "./drive";
import { aiRouter } from "./ai";
import { captureRouter } from "./capture";
import { sessionRouter } from "./session";

export const appRouter = router({
  health: healthRouter,
  user: userRouter,
  drive: driveRouter,
  ai: aiRouter,
  capture: captureRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;

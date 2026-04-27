import { router } from "@/server/trpc";
import { healthRouter } from "./health";
import { userRouter } from "./user";
import { driveRouter } from "./drive";

export const appRouter = router({
  health: healthRouter,
  user: userRouter,
  drive: driveRouter,
});

export type AppRouter = typeof appRouter;

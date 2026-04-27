import { router } from "@/server/trpc";
import { healthRouter } from "./health";
import { userRouter } from "./user";
import { driveRouter } from "./drive";
import { aiRouter } from "./ai";
import { captureRouter } from "./capture";
import { sessionRouter } from "./session";
import { tasksRouter } from "./tasks";
import { projectsRouter } from "./projects";
import { contextsRouter } from "./contexts";
import { tagsRouter } from "./tags";
import { searchRouter } from "./search";

export const appRouter = router({
  health: healthRouter,
  user: userRouter,
  drive: driveRouter,
  ai: aiRouter,
  capture: captureRouter,
  session: sessionRouter,
  tasks: tasksRouter,
  projects: projectsRouter,
  contexts: contextsRouter,
  tags: tagsRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;

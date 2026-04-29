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
import { foldersRouter } from "./folders";
import { reviewRouter } from "./review";
import { forecastRouter } from "./forecast";
import { emailsRouter } from "./emails";
import { attachmentsRouter } from "./attachments";
import { waitlistRouter } from "./waitlist";
import { checklistRouter } from "./checklist";

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
  folders: foldersRouter,
  review: reviewRouter,
  forecast: forecastRouter,
  emails: emailsRouter,
  attachments: attachmentsRouter,
  waitlist: waitlistRouter,
  checklist: checklistRouter,
});

export type AppRouter = typeof appRouter;

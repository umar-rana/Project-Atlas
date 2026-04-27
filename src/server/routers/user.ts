import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { z } from "zod";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUnique({ where: { id: ctx.user.id } });
    if (!user) throw new Error("User not found");
    return user;
  }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        timezone: z.string().optional(),
        date_format: z.string().optional(),
        time_format: z.enum(["12h", "24h"]).optional(),
        week_start: z.enum(["sunday", "monday"]).optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await db.user.update({
        where: { id: ctx.user.id },
        data: input,
      });
      return updated;
    }),
});

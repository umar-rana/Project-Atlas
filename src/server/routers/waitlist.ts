import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, publicProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { TRPCError } from "@trpc/server";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "waitlist" });

export const waitlistRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100),
        email: z.string().email("Please enter a valid email address").max(200),
        message: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const normalizedEmail = input.email.trim().toLowerCase();

      try {
        await db.waitlistEntry.create({
          data: {
            id: newId(),
            name: input.name.trim(),
            email: normalizedEmail,
            message: input.message?.trim() ?? null,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email is already on the waitlist.",
          });
        }
        throw err;
      }

      log.info("New waitlist entry created");

      return { success: true };
    }),
});

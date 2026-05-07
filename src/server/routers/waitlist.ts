import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, publicProcedure, adminProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { TRPCError } from "@trpc/server";
import { createLogger } from "@/core/logging";
import { sendWaitlistNotification } from "@/core/email";

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
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email is already on the waitlist.",
          });
        }
        throw err;
      }

      log.info("New waitlist entry created");

      const notifyResult = await sendWaitlistNotification({
        name: input.name.trim(),
        email: normalizedEmail,
        message: input.message?.trim() ?? null,
      });
      if (!notifyResult.success) {
        log.warn({ error: notifyResult.error }, "Waitlist notification email failed");
      }

      return { success: true };
    }),

  adminList: adminProcedure.query(async () => {
    const entries = await db.waitlistEntry.findMany({
      orderBy: { created_at: "desc" },
    });
    return entries;
  }),

  adminUpdateStatus: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["pending", "invited", "dismissed"]),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const entry = await db.waitlistEntry.update({
          where: { id: input.id },
          data: { status: input.status },
        });
        log.info({ id: input.id, status: input.status }, "Waitlist entry status updated");
        return entry;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Waitlist entry not found.",
          });
        }
        throw err;
      }
    }),
});

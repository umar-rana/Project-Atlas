import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import { z } from "zod";

const log = createLogger({ module: "emails-router" });

const EMAIL_DOMAIN = "atlas.insightive.io";
const FROM_ADDRESS = `Atlas <noreply@${EMAIL_DOMAIN}>`;
const PLAIN_INBOX = `inbox@${EMAIL_DOMAIN}`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const emailsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().uuid().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const cursor = input?.cursor;

      const captures = await db.emailCapture.findMany({
        where: {
          user_id: ctx.user.id,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: [{ id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          from_address: true,
          subject: true,
          status: true,
          task_id: true,
          received_at: true,
          created_at: true,
        },
      });

      let nextCursor: string | undefined;
      if (captures.length > limit) {
        captures.pop();
        const last = captures[captures.length - 1];
        nextCursor = last?.id;
      }

      return {
        captures,
        nextCursor,
      };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const capture = await db.emailCapture.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!capture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email capture not found" });
      }
      return capture;
    }),

  sendVerificationEmail: protectedProcedure
    .mutation(async ({ ctx }) => {
      const apiKey = process.env.RESEND_API_KEY ?? process.env.RESEND_KEY;
      if (!apiKey) {
        log.error({ userId: ctx.user.id }, "Resend API key not configured");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Outbound email is not configured. Set RESEND_API_KEY to enable verification emails.",
        });
      }

      const recipient = ctx.user.email;
      if (!recipient || !recipient.includes("@")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your account has no valid email address on file.",
        });
      }

      const directAddress = `inbox+${ctx.user.id}@${EMAIL_DOMAIN}`;
      const subject = "Atlas inbox routing test";
      const text = [
        `Hi,`,
        ``,
        `This is a test email from Atlas to confirm that inbox routing works for you.`,
        ``,
        `Because this email was sent to your account address (${recipient}), Atlas now knows that the plain inbox address will work when you forward or send mail from this account:`,
        ``,
        `  ${PLAIN_INBOX}`,
        ``,
        `You can also always use your personal direct address, which routes regardless of sender:`,
        ``,
        `  ${directAddress}`,
        ``,
        `If you didn't request this email, you can safely ignore it.`,
        ``,
        `— Atlas`,
      ].join("\n");

      const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 16px; font-size: 18px;">Atlas inbox routing test</h2>
  <p>This is a test email from Atlas to confirm that inbox routing works for you.</p>
  <p>Because this email was sent to your account address (<strong>${escapeHtml(recipient)}</strong>), Atlas now knows that the plain inbox address will work when you forward or send mail from this account:</p>
  <p style="background: #f4f4f5; padding: 10px 12px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px;">${escapeHtml(PLAIN_INBOX)}</p>
  <p>You can also always use your personal direct address, which routes regardless of sender:</p>
  <p style="background: #f4f4f5; padding: 10px 12px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px;">${escapeHtml(directAddress)}</p>
  <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If you didn't request this email, you can safely ignore it.</p>
  <p style="color: #6b7280; font-size: 13px;">— Atlas</p>
</body>
</html>`.trim();

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [recipient],
            subject,
            text,
            html,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          log.error(
            { userId: ctx.user.id, status: res.status, body: errBody.slice(0, 500) },
            "Resend send failed",
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Email send failed (${res.status}). Please try again later.`,
          });
        }

        const data = (await res.json().catch(() => ({}))) as { id?: string };
        log.info({ userId: ctx.user.id, recipient, resendId: data.id }, "Verification email sent");
        return { success: true as const, recipient, id: data.id };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        log.error({ userId: ctx.user.id, err }, "Verification email exception");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Email send failed. Please try again later.",
        });
      }
    }),

  discardCapture: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const capture = await db.emailCapture.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!capture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email capture not found" });
      }
      const updated = await db.emailCapture.update({
        where: { id: input.id },
        data: { status: "discarded" },
      });
      return updated;
    }),
});

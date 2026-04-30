import { createLogger } from "@/core/logging";

const log = createLogger({ module: "email" });

const EMAIL_DOMAIN = "atlas.insightive.io";
const FROM_ADDRESS = `Atlas <noreply@${EMAIL_DOMAIN}>`;

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY ?? process.env.RESEND_KEY;
  if (!apiKey) {
    log.warn("Resend API key not configured — skipping email send");
    return { success: false, error: "Email not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [options.to],
        subject: options.subject,
        text: options.text,
        html: options.html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      log.error({ status: res.status, body: errBody.slice(0, 500) }, "Resend send failed");
      return { success: false, error: `HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    log.info({ to: options.to, subject: options.subject, resendId: data.id }, "Email sent");
    return { success: true, id: data.id };
  } catch (err) {
    log.error({ err }, "Email send exception");
    return { success: false, error: String(err) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface WaitlistNotificationOptions {
  name: string;
  email: string;
  message?: string | null;
}

export async function sendWaitlistNotification(
  opts: WaitlistNotificationOptions,
): Promise<SendEmailResult> {
  const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL;
  if (!notifyEmail) {
    log.warn("WAITLIST_NOTIFY_EMAIL not set — skipping waitlist notification");
    return { success: false, error: "WAITLIST_NOTIFY_EMAIL not configured" };
  }

  const subject = `New waitlist request from ${opts.name}`;

  const text = [
    `New waitlist request`,
    ``,
    `Name:    ${opts.name}`,
    `Email:   ${opts.email}`,
    opts.message ? `Message: ${opts.message}` : `Message: (none)`,
    ``,
    `— Atlas`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 16px; font-size: 18px;">New waitlist request</h2>
  <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
    <tr>
      <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; width: 90px; border-radius: 4px 0 0 4px;">Name</td>
      <td style="padding: 8px 12px; background: #fafafa;">${escapeHtml(opts.name)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; border-radius: 4px 0 0 4px;">Email</td>
      <td style="padding: 8px 12px; background: #fafafa;"><a href="mailto:${escapeHtml(opts.email)}" style="color: #2563eb;">${escapeHtml(opts.email)}</a></td>
    </tr>
    ${
      opts.message
        ? `<tr>
      <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; vertical-align: top; border-radius: 4px 0 0 4px;">Message</td>
      <td style="padding: 8px 12px; background: #fafafa;">${escapeHtml(opts.message)}</td>
    </tr>`
        : ""
    }
  </table>
  <p style="color: #6b7280; font-size: 13px;">— Atlas</p>
</body>
</html>`.trim();

  return sendEmail({ to: notifyEmail, subject, text, html });
}

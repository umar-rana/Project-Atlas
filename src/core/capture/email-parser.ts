import { simpleParser, type ParsedMail, type Attachment } from "mailparser";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "email-parser" });

export interface ParsedEmail {
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  messageId: string | null;
  receivedAt: Date;
  isAutoReply: boolean;
  isCalendarInvite: boolean;
  isForwarded: boolean;
  originalSender: string | null;
  attachments: ParsedEmailAttachment[];
}

export interface ParsedEmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
}

const MAX_PARSE_CHARS = 10_000;

function extractAutoReplyHeader(mail: ParsedMail): boolean {
  const autoSubmitted = mail.headers.get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const xAutoReply = mail.headers.get("x-autoreply");
  if (xAutoReply) return true;
  const xAutorespond = mail.headers.get("x-autorespond");
  if (xAutorespond) return true;
  return false;
}

function extractIsCalendar(mail: ParsedMail, attachments: ParsedEmailAttachment[]): boolean {
  const contentType = mail.headers.get("content-type");
  if (typeof contentType === "string" && contentType.includes("text/calendar")) return true;
  for (const att of attachments) {
    if (
      att.contentType === "text/calendar" ||
      att.contentType === "application/ics" ||
      att.filename.endsWith(".ics")
    ) {
      return true;
    }
  }
  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractOriginalSender(from: string, bodyText: string): string | null {
  const forwardPatterns = [/^From:\s*([^\n<>]+?)\s*<([^>]+)>/im, /^From:\s*([^\n]+@[^\n]+)/im];
  for (const pattern of forwardPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      return match[2] ?? match[1] ?? null;
    }
  }
  return null;
}

export async function parseEmail(rawEmail: string | Buffer): Promise<ParsedEmail> {
  let mail: ParsedMail;
  try {
    mail = await simpleParser(rawEmail);
  } catch (err) {
    log.error({ err }, "Failed to parse raw email");
    throw new Error("Email parsing failed");
  }

  const fromAddress =
    (Array.isArray(mail.from?.value) ? mail.from?.value[0]?.address : undefined) ?? "";
  const fromName =
    (Array.isArray(mail.from?.value) ? mail.from?.value[0]?.name : undefined) ?? null;

  const attachments: ParsedEmailAttachment[] = (mail.attachments ?? [])
    .slice(0, 10)
    .map((att: Attachment) => ({
      filename: att.filename ?? "attachment",
      contentType: att.contentType ?? "application/octet-stream",
      size: att.size ?? att.content?.byteLength ?? 0,
      content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content ?? []),
    }));

  const bodyText = mail.text ? mail.text : mail.html ? stripHtml(mail.html) : "";

  const subject = mail.subject ?? null;
  const isForwarded = !!(subject && /^fwd?:/i.test(subject.trim()));
  const originalSender = isForwarded ? extractOriginalSender(fromAddress, bodyText) : null;

  const isAutoReply = extractAutoReplyHeader(mail);
  const isCalendarInvite = extractIsCalendar(mail, attachments);

  const messageId = mail.messageId ?? null;
  const receivedAt = mail.date ?? new Date();

  return {
    fromAddress,
    fromName: fromName || null,
    subject,
    bodyText,
    bodyHtml: mail.html || null,
    messageId,
    receivedAt,
    isAutoReply,
    isCalendarInvite,
    isForwarded,
    originalSender,
    attachments,
  };
}

export function buildCaptureText(parsed: ParsedEmail): string {
  const parts: string[] = [];
  if (parsed.subject) parts.push(parsed.subject);
  if (parsed.bodyText) parts.push(parsed.bodyText);
  return parts.join("\n\n").slice(0, MAX_PARSE_CHARS);
}

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { parseEmail, buildCaptureText } from "@/core/capture/email-parser";
import { captureAndCreate } from "@/core/capture/service";
import { uploadFile } from "@/core/storage";
import { logActivity } from "@/core/audit";

const log = createLogger({ module: "email/inbound" });

interface RecipientResult {
  userId: string | null;
  strategy: "addressed" | "sender_lookup" | "unrouted";
}

function extractUserIdFromAddress(toAddresses: string[]): { userId: string | null; isPlainInbox: boolean } {
  for (const addr of toAddresses) {
    const localPart = addr.split("@")[0]?.toLowerCase().trim();
    if (!localPart) continue;
    if (localPart.startsWith("inbox+")) {
      const uid = localPart.slice("inbox+".length) || null;
      return { userId: uid, isPlainInbox: false };
    }
    if (localPart === "inbox") {
      return { userId: null, isPlainInbox: true };
    }
  }
  return { userId: null, isPlainInbox: false };
}

async function resolveRecipient(toAddresses: string[], fromAddress: string): Promise<RecipientResult> {
  const { userId, isPlainInbox } = extractUserIdFromAddress(toAddresses);

  if (userId) {
    return { userId, strategy: "addressed" };
  }

  if (isPlainInbox && fromAddress) {
    const senderEmail = fromAddress.replace(/^[^<]*<([^>]+)>.*$/, "$1").trim().toLowerCase();
    if (senderEmail && senderEmail.includes("@")) {
      const user = await db.user.findFirst({
        where: { email: senderEmail, deleted_at: null },
        select: { id: true },
      });
      if (user) {
        return { userId: user.id, strategy: "sender_lookup" };
      }
    }
    return { userId: null, strategy: "unrouted" };
  }

  return { userId: null, strategy: "unrouted" };
}

function verifyResendSignature(body: string, request: NextRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      log.error({}, "RESEND_WEBHOOK_SECRET not set in production — rejecting inbound email");
      return false;
    }
    log.warn({}, "RESEND_WEBHOOK_SECRET not set — skipping signature verification (dev only)");
    return true;
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    const resendSig = request.headers.get("resend-signature");
    if (!resendSig) {
      log.warn({}, "No webhook signature headers found");
      return false;
    }
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    try {
      const resendBuf = Buffer.from(resendSig, "hex");
      const expectedBuf = Buffer.from(expected, "hex");
      if (resendBuf.length !== expectedBuf.length) return false;
      return timingSafeEqual(resendBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const sigValue = sig.replace(/^v1,/, "");
    try {
      const computedBuf = Buffer.from(computed, "base64");
      const sigBuf = Buffer.from(sigValue, "base64");
      if (computedBuf.length === sigBuf.length && timingSafeEqual(computedBuf, sigBuf)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function getEmailFilterSettings(tasksPrefs: Record<string, unknown>): {
  filterAutoReplies: boolean;
  filterCalendar: boolean;
  blocklist: string[];
} {
  return {
    filterAutoReplies: tasksPrefs["email_filter_auto_replies"] !== false,
    filterCalendar: tasksPrefs["email_filter_calendar"] !== false,
    blocklist: Array.isArray(tasksPrefs["email_blocklist"])
      ? (tasksPrefs["email_blocklist"] as string[]).map((s) => s.toLowerCase().trim())
      : [],
  };
}

export async function POST(req: NextRequest) {
  let body: string;
  try {
    body = await req.text();
  } catch (err) {
    log.error({ err }, "Failed to read inbound email body");
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!verifyResendSignature(body, req)) {
    log.warn({}, "Inbound email webhook signature invalid");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch (err) {
    log.error({ err }, "Failed to parse inbound email JSON payload");
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;

  const toAddresses = Array.isArray(data.to)
    ? (data.to as string[])
    : typeof data.to === "string"
      ? [data.to]
      : [];

  const fromAddress = typeof data.from === "string" ? data.from : "";
  const subject = typeof data.subject === "string" ? data.subject : null;
  const bodyText = typeof data.text === "string" ? data.text : null;
  const bodyHtml = typeof data.html === "string" ? data.html : null;
  const messageId = typeof data.messageId === "string" ? data.messageId :
    typeof data.message_id === "string" ? data.message_id : null;
  const headers = (data.headers ?? {}) as Record<string, string>;

  const rawEmail = typeof data.raw === "string" ? data.raw : null;

  let parsed;
  if (rawEmail) {
    try {
      parsed = await parseEmail(rawEmail);
    } catch (err) {
      log.warn({ err }, "mailparser failed on raw email — using JSON fields directly");
      parsed = null;
    }
  } else {
    parsed = null;
  }

  const finalFromAddress = parsed?.fromAddress ?? fromAddress;
  const finalSubject = parsed?.subject ?? subject;
  const finalBodyText = parsed?.bodyText ?? bodyText ?? "";
  const finalBodyHtml = parsed?.bodyHtml ?? bodyHtml;
  const finalMessageId = parsed?.messageId ?? messageId;
  const finalReceivedAt = parsed?.receivedAt ?? new Date();
  const isAutoReply = parsed?.isAutoReply ?? (
    headers["auto-submitted"] != null && headers["auto-submitted"] !== "no"
  );
  const isCalendar = parsed?.isCalendarInvite ?? false;
  const isForwarded = parsed?.isForwarded ?? (finalSubject != null && /^fwd?:/i.test(finalSubject));

  const toAddress = toAddresses[0] ?? "";

  const { userId, strategy } = await resolveRecipient(toAddresses, finalFromAddress);

  if (!userId) {
    log.warn({ toAddresses, strategy }, "Inbound email could not be routed to a user");
    await logActivity({
      user_id: undefined,
      entity_type: "EmailCapture",
      entity_id: newId(),
      action: "email_capture_received",
      meta: {
        from: finalFromAddress,
        subject: finalSubject,
        to: toAddress,
        routed: false,
        strategy,
      },
    });
    return NextResponse.json({ ok: true, status: "unrouted" });
  }

  const user = await db.user.findFirst({
    where: { id: userId, deleted_at: null },
    select: { id: true, tasks_prefs: true },
  });

  if (!user) {
    log.warn({ userId }, "No user found for inbox email");
    await logActivity({
      user_id: undefined,
      entity_type: "EmailCapture",
      entity_id: newId(),
      action: "email_capture_received",
      meta: {
        from: finalFromAddress,
        subject: finalSubject,
        to: toAddress,
        routed: false,
        reason: "user_not_found",
        attempted_user_id: userId,
      },
    });
    return NextResponse.json({ ok: true, status: "no_user" });
  }

  const tasksPrefs = (typeof user.tasks_prefs === "object" && user.tasks_prefs !== null
    ? user.tasks_prefs
    : {}) as Record<string, unknown>;

  const { filterAutoReplies, filterCalendar, blocklist } = getEmailFilterSettings(tasksPrefs);

  let discardReason: string | null = null;

  if (filterAutoReplies && isAutoReply) {
    discardReason = "auto_reply";
  } else if (filterCalendar && isCalendar) {
    discardReason = "calendar_invite";
  } else if (blocklist.length > 0 && finalFromAddress) {
    const sender = finalFromAddress.toLowerCase().trim();
    const isBlocked = blocklist.some((blocked) => {
      if (!blocked) return false;
      return sender === blocked || sender.endsWith(`@${blocked}`);
    });
    if (isBlocked) {
      discardReason = "blocklisted";
    }
  }

  const captureId = newId();

  try {
    await db.emailCapture.create({
      data: {
        id: captureId,
        user_id: user.id,
        from_address: finalFromAddress,
        to_address: toAddress,
        subject: finalSubject,
        body_text: finalBodyText || null,
        body_html: finalBodyHtml,
        message_id: finalMessageId,
        received_at: finalReceivedAt,
        status: discardReason ? "discarded" : "pending",
      },
    });
  } catch (err) {
    log.error({ err, userId: user.id }, "Failed to create EmailCapture record");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  await logActivity({
    user_id: user.id,
    entity_type: "EmailCapture",
    entity_id: captureId,
    action: "email_capture_received",
    meta: {
      from: finalFromAddress,
      subject: finalSubject,
      discarded: !!discardReason,
      discard_reason: discardReason,
      is_forwarded: isForwarded,
      routing_strategy: strategy,
    },
  });

  if (discardReason) {
    log.info({ captureId, discardReason, userId: user.id }, "Email capture discarded");
    return NextResponse.json({ ok: true, status: "discarded", reason: discardReason });
  }

  await db.emailCapture.update({
    where: { id: captureId },
    data: { status: "processing" },
  });

  const emailAttachments = parsed?.attachments ?? [];

  const parseText = buildCaptureText({
    fromAddress: finalFromAddress,
    fromName: parsed?.fromName ?? null,
    subject: finalSubject,
    bodyText: finalBodyText,
    bodyHtml: finalBodyHtml,
    messageId: finalMessageId,
    receivedAt: finalReceivedAt,
    isAutoReply,
    isCalendarInvite: isCalendar,
    isForwarded,
    originalSender: parsed?.originalSender ?? null,
    attachments: emailAttachments,
  });

  let taskId: string | null = null;
  let processingError: string | null = null;

  try {
    const result = await captureAndCreate({
      rawText: parseText,
      userId: user.id,
      source: "email",
    });
    taskId = result.taskId;
  } catch (err) {
    log.error({ err, captureId, userId: user.id }, "Email capture processing failed");
    processingError = err instanceof Error ? err.message : "Unknown error";
  }

  if (processingError) {
    await db.emailCapture.update({
      where: { id: captureId },
      data: { status: "failed", error: processingError },
    });
    return NextResponse.json({ ok: false, status: "failed" }, { status: 500 });
  }

  let uploadedCount = 0;
  if (emailAttachments.length > 0 && taskId) {
    for (const att of emailAttachments.slice(0, 10)) {
      try {
        await uploadFile({
          userId: user.id,
          filename: att.filename,
          contentType: att.contentType,
          data: att.content,
          taskId,
        });
        uploadedCount++;
      } catch (err) {
        log.warn({ err, filename: att.filename, captureId }, "Failed to upload email attachment");
      }
    }
  }

  await db.emailCapture.update({
    where: { id: captureId },
    data: {
      status: "processed",
      task_id: taskId ?? undefined,
    },
  });

  log.info({ captureId, taskId, userId: user.id, attachments: uploadedCount }, "Email capture processed");
  return NextResponse.json({ ok: true, status: "processed", taskId });
}

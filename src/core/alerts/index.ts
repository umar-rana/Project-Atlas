import { createLogger } from "@/core/logging";
import { sendEmail } from "@/core/email";

const log = createLogger({ module: "alerts" });

export interface HealthAlertPayload {
  ok: boolean;
  db: boolean;
  ts: string;
  reason?: string;
}

/**
 * Incident state — in-memory.
 *
 * `incidentActive` is true from the moment we successfully fire an outage alert
 * until we successfully fire the corresponding recovery alert.  While an incident
 * is active every subsequent outage check is suppressed, so exactly one alert is
 * sent per incident regardless of how long the outage lasts.
 */
let incidentActive = false;

async function sendSlackAlert(webhookUrl: string, payload: HealthAlertPayload): Promise<void> {
  const isOutage = !payload.ok;
  const status = isOutage ? "🚨 Outage Detected" : "✅ Service Recovered";
  const dbStatus = payload.db ? "✅ Up" : "❌ Down";

  const message = {
    text: `*Atlas Health Alert* — ${status}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Atlas Health Alert — ${status}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Database:*\n${dbStatus}` },
          { type: "mrkdwn", text: `*Timestamp:*\n${payload.ts}` },
        ],
      },
      ...(payload.reason
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Reason:* ${payload.reason}` },
            },
          ]
        : []),
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error({ status: res.status, body: body.slice(0, 500) }, "Slack alert delivery failed");
    throw new Error(`Slack webhook returned HTTP ${res.status}`);
  }

  log.info({ ok: payload.ok }, "Slack health alert sent");
}

async function sendEmailAlert(toAddress: string, payload: HealthAlertPayload): Promise<void> {
  const isOutage = !payload.ok;
  const statusLabel = isOutage ? "OUTAGE DETECTED" : "Service Recovered";
  const subject = `[Atlas Health] ${statusLabel} — ${payload.ts}`;

  const dbStatus = payload.db ? "Up" : "Down";

  const text = [
    `Atlas Health Alert`,
    ``,
    `Status:    ${statusLabel}`,
    `Database:  ${dbStatus}`,
    `Timestamp: ${payload.ts}`,
    payload.reason ? `Reason:    ${payload.reason}` : "",
    ``,
    `— Atlas`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const statusColor = isOutage ? "#dc2626" : "#16a34a";
  const dbBadge = payload.db
    ? `<span style="color:#16a34a;font-weight:600;">✓ Up</span>`
    : `<span style="color:#dc2626;font-weight:600;">✗ Down</span>`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border-left:4px solid ${statusColor};padding:12px 16px;background:#f9fafb;border-radius:0 6px 6px 0;margin-bottom:20px;">
    <h2 style="margin:0 0 4px;font-size:18px;color:${statusColor};">${statusLabel}</h2>
    <p style="margin:0;font-size:13px;color:#6b7280;">Atlas Health Monitor</p>
  </div>
  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <tr>
      <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:110px;border-radius:4px 0 0 4px;">Database</td>
      <td style="padding:8px 12px;background:#fafafa;">${dbBadge}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;border-radius:4px 0 0 4px;">Timestamp</td>
      <td style="padding:8px 12px;background:#fafafa;">${payload.ts}</td>
    </tr>
    ${
      payload.reason
        ? `<tr>
      <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;vertical-align:top;border-radius:4px 0 0 4px;">Reason</td>
      <td style="padding:8px 12px;background:#fafafa;">${payload.reason}</td>
    </tr>`
        : ""
    }
  </table>
  <p style="color:#6b7280;font-size:13px;">— Atlas</p>
</body>
</html>`.trim();

  const result = await sendEmail({ to: toAddress, subject, text, html });
  if (!result.success) {
    throw new Error(result.error ?? "Email send failed");
  }

  log.info({ ok: payload.ok, to: toAddress }, "Email health alert sent");
}

/**
 * Deliver the alert to all configured channels.
 * Returns true if at least one configured channel succeeded.
 * Unconfigured channels are excluded entirely — they do not count as successes.
 */
async function deliverAlert(payload: HealthAlertPayload): Promise<boolean> {
  const slackWebhook = process.env.HEALTH_ALERT_SLACK_WEBHOOK;
  const alertEmail = process.env.HEALTH_ALERT_EMAIL;

  const sends: Promise<void>[] = [];
  if (slackWebhook) sends.push(sendSlackAlert(slackWebhook, payload));
  if (alertEmail) sends.push(sendEmailAlert(alertEmail, payload));

  if (sends.length === 0) {
    log.debug("deliverAlert called with no configured channels — nothing to send");
    return false;
  }

  const results = await Promise.allSettled(sends);

  const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failures.length > 0) {
    log.error(
      { errors: failures.map((f) => String(f.reason)) },
      "One or more health alert channels failed",
    );
  }

  const anySucceeded = results.some((r) => r.status === "fulfilled");
  return anySucceeded;
}

/**
 * Fire a health alert when an outage starts or ends.
 *
 * De-duplication rules (true incident-state semantics):
 * - Outage detected, incident not yet active → send outage alert; mark incident active.
 * - Outage detected, incident already active → suppress (same incident, already notified).
 * - Service recovered, incident was active → send recovery alert; mark incident inactive.
 * - Service recovered, incident not active → suppress (no prior outage alert to pair with).
 *
 * State is in-process memory.  A server restart resets it, which means a fresh outage
 * alert fires after restart even if one was sent before — this is acceptable and preferred
 * over silently losing an outage notification.
 */
export async function fireHealthAlert(payload: HealthAlertPayload): Promise<void> {
  const slackWebhook = process.env.HEALTH_ALERT_SLACK_WEBHOOK;
  const alertEmail = process.env.HEALTH_ALERT_EMAIL;

  if (!slackWebhook && !alertEmail) {
    log.debug(
      "No alert channels configured (HEALTH_ALERT_SLACK_WEBHOOK, HEALTH_ALERT_EMAIL) — skipping",
    );
    return;
  }

  const isOutage = !payload.ok;

  if (isOutage) {
    if (incidentActive) {
      log.debug("Outage alert suppressed — incident already active (same incident)");
      return;
    }

    log.warn({ ts: payload.ts, reason: payload.reason }, "Health outage detected — firing alert");
    const delivered = await deliverAlert(payload);
    if (delivered) {
      incidentActive = true;
    }
  } else {
    if (!incidentActive) {
      log.debug("Recovery suppressed — no active incident (service was already healthy)");
      return;
    }

    log.info({ ts: payload.ts }, "Health recovered — firing recovery alert");
    const delivered = await deliverAlert(payload);
    if (delivered) {
      incidentActive = false;
    }
  }
}

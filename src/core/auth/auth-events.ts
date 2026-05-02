import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "auth-events" });

export type AuthAction =
  | "auth:resolved_by_clerk_id"
  | "auth:resolved_by_email_fallback"
  | "auth:resolved_by_orphan_recovery"
  | "auth:created_new_user"
  | "auth:failed";

export async function logAuthEvent(
  action: AuthAction,
  userId: string | null,
  clerkId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await logActivity({
      user_id: userId ?? undefined,
      entity_type: "AuthEvent",
      entity_id: userId ?? clerkId,
      action,
      meta: {
        clerk_id: clerkId,
        ...meta,
      },
    });
  } catch (err) {
    log.error({ err, action, clerkId }, "Failed to write auth event log");
  }
}

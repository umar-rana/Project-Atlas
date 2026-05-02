import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { User } from "@prisma/client";

const log = createLogger({ module: "profile-sync" });

interface ClerkUserProfile {
  id: string;
  emailAddresses: Array<{ emailAddress: string; verification?: { status: string } | null }>;
  firstName: string | null;
  lastName: string | null;
  imageUrl?: string;
}

function fullName(clerkUser: { firstName: string | null; lastName: string | null }): string | null {
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Sync the user's profile fields from Clerk. This is intentionally non-destructive
 * and collision-safe:
 *
 * - Only updates fields that have actually changed.
 * - If the email update triggers a P2002 (the new email is already held by another
 *   row, e.g. an orphan account), the email field is skipped and only name/image
 *   are synced. The email collision is expected to be resolved by orphan recovery
 *   in the calling auth flow.
 * - On any other unexpected error during sync, the error is logged and the
 *   original user record is returned so that auth + orphan recovery can still
 *   proceed — sync failure is never allowed to abort login.
 *
 * Returns the updated user record (or original if no update was needed/succeeded).
 */
export async function syncProfileFromClerk(user: User, clerkUser: ClerkUserProfile): Promise<User> {
  // Prefer the first VERIFIED email; fall back to first email; fall back to stored.
  const verifiedEmail =
    clerkUser.emailAddresses.find((e) => e.verification?.status === "verified")?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    user.email;

  const clerkName = fullName(clerkUser);
  const clerkImage = clerkUser.imageUrl ?? null;

  const needsUpdate =
    (verifiedEmail && verifiedEmail !== user.email) ||
    (clerkName !== null && clerkName !== user.name) ||
    (clerkImage !== null && clerkImage !== user.image);

  if (!needsUpdate) return user;

  const data: Record<string, string | null> = {};
  if (verifiedEmail && verifiedEmail !== user.email) data.email = verifiedEmail;
  if (clerkName !== null && clerkName !== user.name) data.name = clerkName;
  if (clerkImage !== null && clerkImage !== user.image) data.image = clerkImage;

  log.info({ user_id: user.id, changes: Object.keys(data) }, "Syncing profile from Clerk");

  try {
    return await db.user.update({ where: { id: user.id }, data });
  } catch (err: unknown) {
    if (isPrismaUniqueError(err) && "email" in data) {
      // The email Clerk gave us is already held by another row (likely an orphan).
      // Skip the email update and sync only name/image so auth + orphan recovery
      // can still proceed and resolve the collision.
      log.warn(
        { user_id: user.id, colliding_email: data.email },
        "Profile sync: email collision (P2002) — skipping email update; orphan recovery will resolve",
      );
      const { email: _dropped, ...nonEmailData } = data;
      if (Object.keys(nonEmailData).length === 0) return user;
      try {
        return await db.user.update({ where: { id: user.id }, data: nonEmailData });
      } catch (innerErr: unknown) {
        log.error(
          { user_id: user.id, err: innerErr },
          "Profile sync: non-email update also failed — returning original user",
        );
        return user;
      }
    }
    // Non-unique error — log and continue auth rather than aborting login.
    log.error(
      { user_id: user.id, err },
      "Profile sync: unexpected error — returning original user so auth can continue",
    );
    return user;
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

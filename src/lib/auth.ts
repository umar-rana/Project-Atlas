import { currentUser } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { withDeleted } from "@/core/db/soft-delete";
import { createLogger } from "@/core/logging";
import { logAuthEvent } from "@/core/auth/auth-events";
import { syncProfileFromClerk } from "@/core/auth/profile-sync";
import { attemptOrphanRecovery } from "@/core/auth/orphan-recovery";
import type { Prisma, User } from "@prisma/client";

const log = createLogger({ module: "auth" });

export async function getOrCreateUserFromClerk(): Promise<User | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return null;
  }

  // 1. Resolve by Clerk ID (fast path) — always runs first so that users
  //    without a primary email can still be found and so Clerk-ID resolution
  //    always wins over email fallback.
  const existing = await db.user.findUnique({ where: { clerk_id: clerkUser.id } });
  if (existing) {
    const synced = await syncProfileFromClerk(existing, clerkUser);
    await logAuthEvent("auth:resolved_by_clerk_id", synced.id, clerkUser.id);
    await attemptOrphanRecovery(synced, clerkUser);
    return synced;
  }

  // Collect verified emails for the email-fallback and create paths.
  const verifiedEmails = clerkUser.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress)
    .filter(Boolean);

  // 2. Email fallback — search live users by verified email (case-insensitive).
  //    This handles cases where a user's Clerk ID changed (e.g. identity merge).
  //    Note: db.user.findFirst uses the soft-delete middleware (live users only).
  for (const email of verifiedEmails) {
    const byEmail = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (byEmail) {
      log.info(
        {
          clerk_id: clerkUser.id,
          matched_email: email,
          all_emails_checked: verifiedEmails,
          existing_user_id: byEmail.id,
        },
        "Re-associating Clerk ID to existing user found by verified email",
      );

      let updated: User;
      try {
        updated = await db.user.update({
          where: { id: byEmail.id },
          data: {
            clerk_id: clerkUser.id,
            name: byEmail.name ?? fullName(clerkUser),
            image: clerkUser.imageUrl ?? byEmail.image,
          },
        });
      } catch (err: unknown) {
        // P2002 = unique constraint violation on clerk_id (race condition)
        if (isPrismaUniqueError(err)) {
          const refetched = await db.user.findUnique({ where: { clerk_id: clerkUser.id } });
          if (refetched) {
            const raceSynced = await syncProfileFromClerk(refetched, clerkUser);
            await logAuthEvent("auth:resolved_by_clerk_id", raceSynced.id, clerkUser.id, {
              note: "race_condition_recovery",
            });
            await attemptOrphanRecovery(raceSynced, clerkUser);
            return raceSynced;
          }
        }
        await logAuthEvent("auth:failed", null, clerkUser.id, {
          reason: "email_fallback_update_failed",
          matched_email: email,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const emailSynced = await syncProfileFromClerk(updated, clerkUser);
      await logAuthEvent("auth:resolved_by_email_fallback", emailSynced.id, clerkUser.id, {
        matched_email: email,
        all_emails_checked: verifiedEmails,
      });
      await attemptOrphanRecovery(emailSynced, clerkUser);
      return emailSynced;
    }
  }

  // 2b. Pre-create orphan scan — withDeleted() bypasses the soft-delete
  //     middleware so we find soft-deleted accounts sharing a verified email.
  //     This prevents a P2002 on email uniqueness during create and allows
  //     data from a soft-deleted account to be merged before a new row is made.
  if (verifiedEmails.length > 0) {
    const softDeletedOrphan = await db.user.findFirst({
      where: withDeleted<Prisma.UserWhereInput>({
        email: { in: verifiedEmails, mode: "insensitive" },
        // Must actually be soft-deleted — live users were handled in step 2.
        NOT: { deleted_at: null },
      }),
    });

    if (softDeletedOrphan) {
      log.info(
        {
          clerk_id: clerkUser.id,
          orphan_id: softDeletedOrphan.id,
          orphan_email: softDeletedOrphan.email,
        },
        "Pre-create orphan scan: found soft-deleted account with matching email — re-activating and re-associating",
      );

      let reactivated: User;
      try {
        reactivated = await db.user.update({
          where: { id: softDeletedOrphan.id },
          data: {
            clerk_id: clerkUser.id,
            deleted_at: null, // restore the soft-deleted account
            name: softDeletedOrphan.name ?? fullName(clerkUser),
            image: clerkUser.imageUrl ?? softDeletedOrphan.image,
          },
        });
      } catch (err: unknown) {
        if (isPrismaUniqueError(err)) {
          const refetched = await db.user.findUnique({ where: { clerk_id: clerkUser.id } });
          if (refetched) {
            const raceSynced = await syncProfileFromClerk(refetched, clerkUser);
            await logAuthEvent("auth:resolved_by_clerk_id", raceSynced.id, clerkUser.id, {
              note: "pre_create_orphan_race_recovery",
            });
            await attemptOrphanRecovery(raceSynced, clerkUser);
            return raceSynced;
          }
        }
        await logAuthEvent("auth:failed", null, clerkUser.id, {
          reason: "pre_create_orphan_reactivation_failed",
          orphan_id: softDeletedOrphan.id,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const orphanSynced = await syncProfileFromClerk(reactivated, clerkUser);
      await logAuthEvent("auth:resolved_by_orphan_recovery", orphanSynced.id, clerkUser.id, {
        orphan_id: softDeletedOrphan.id,
        note: "pre_create_orphan_reactivation",
      });
      await attemptOrphanRecovery(orphanSynced, clerkUser);
      return orphanSynced;
    }
  }

  // 3. Create brand-new user — primary email is required at this point.
  const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) {
    await logAuthEvent("auth:failed", null, clerkUser.id, {
      reason: "no_primary_email",
    });
    return null;
  }

  log.warn(
    {
      clerk_id: clerkUser.id,
      all_emails_checked: verifiedEmails,
    },
    "Creating brand-new user record — no existing record matched any verified email.",
  );

  let user: User;
  try {
    user = await db.user.create({
      data: {
        id: newId(),
        clerk_id: clerkUser.id,
        email: primaryEmail,
        name: fullName(clerkUser),
        image: clerkUser.imageUrl ?? null,
        timezone: "UTC",
        date_format: "DD/MM/YYYY",
        time_format: "24h",
        week_start: "monday",
        theme: "dark",
      },
    });
  } catch (err: unknown) {
    // P2002 = race condition: another request created the user between our check and create
    if (isPrismaUniqueError(err)) {
      const refetched = await db.user.findUnique({ where: { clerk_id: clerkUser.id } });
      if (refetched) {
        const raceSynced = await syncProfileFromClerk(refetched, clerkUser);
        await logAuthEvent("auth:resolved_by_clerk_id", raceSynced.id, clerkUser.id, {
          note: "create_race_condition_recovery",
        });
        await attemptOrphanRecovery(raceSynced, clerkUser);
        return raceSynced;
      }
    }
    await logAuthEvent("auth:failed", null, clerkUser.id, {
      reason: "create_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await logAuthEvent("auth:created_new_user", user.id, clerkUser.id, {
    email: user.email,
    all_emails_checked: verifiedEmails,
    note: "New user created; logged for orphan-detection purposes.",
  });

  // Sync profile fields on new-user create so every successful auth resolution
  // path is semantically identical (Clerk is always source of truth).
  const createdSynced = await syncProfileFromClerk(user, clerkUser);
  await attemptOrphanRecovery(createdSynced, clerkUser);
  return createdSynced;
}

function fullName(clerkUser: { firstName: string | null; lastName: string | null }): string | null {
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

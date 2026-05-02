import { currentUser } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import type { User } from "@prisma/client";

const log = createLogger({ module: "auth" });

export async function getOrCreateUserFromClerk(): Promise<User | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const verifiedEmails = clerkUser.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress)
    .filter(Boolean);

  const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) return null;

  const existing = await db.user.findUnique({ where: { clerk_id: clerkUser.id } });
  if (existing) {
    return existing;
  }

  for (const email of verifiedEmails) {
    const byEmail = await db.user.findUnique({ where: { email } });
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
      return db.user.update({
        where: { id: byEmail.id },
        data: {
          clerk_id: clerkUser.id,
          name: byEmail.name ?? fullName(clerkUser),
          image: clerkUser.imageUrl ?? byEmail.image,
        },
      });
    }
  }

  log.warn(
    {
      clerk_id: clerkUser.id,
      all_emails_checked: verifiedEmails,
    },
    "Creating brand-new user record — no existing record matched any verified email. If this user had data, it may be orphaned under a different user ID.",
  );

  const user = await db.user.create({
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

  await logActivity({
    user_id: user.id,
    entity_type: "User",
    entity_id: user.id,
    action: "create",
    after: { email: user.email, name: user.name },
    meta: {
      clerk_id: clerkUser.id,
      all_emails_checked: verifiedEmails,
      note: "New user created; logged for orphan-detection purposes.",
    },
  });

  return user;
}

function fullName(clerkUser: { firstName: string | null; lastName: string | null }): string | null {
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

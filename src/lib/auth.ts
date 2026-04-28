import { currentUser } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import type { User } from "@prisma/client";

export async function getOrCreateUserFromClerk(): Promise<User | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const existing = await db.user.findUnique({ where: { clerk_id: clerkUser.id } });
  if (existing) {
    return existing;
  }

  const byEmail = await db.user.findUnique({ where: { email } });
  if (byEmail) {
    return db.user.update({
      where: { id: byEmail.id },
      data: {
        clerk_id: clerkUser.id,
        name: byEmail.name ?? fullName(clerkUser),
        image: clerkUser.imageUrl ?? byEmail.image,
      },
    });
  }

  const user = await db.user.create({
    data: {
      id: newId(),
      clerk_id: clerkUser.id,
      email,
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
  });

  return user;
}

function fullName(clerkUser: { firstName: string | null; lastName: string | null }): string | null {
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

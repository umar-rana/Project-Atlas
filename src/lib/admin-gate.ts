import type { User } from "@prisma/client";

export const ADMIN_EMAILS = ["umar@rana.pk"] as const;

export function isAdmin(user: Pick<User, "email">): boolean {
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === user.email.trim().toLowerCase());
}

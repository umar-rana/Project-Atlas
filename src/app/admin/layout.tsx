import { notFound } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getOrCreateUserFromClerk();
  if (!user || !isAdmin(user)) {
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}

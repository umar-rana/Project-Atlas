import { Metadata } from "next";
import dynamic from "next/dynamic";
import { getOrCreateUserFromClerk } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Health — Atlas Admin",
};

const HealthClient = dynamic(() => import("./health-client").then((m) => m.HealthClient));

export default async function HealthPage() {
  const { notFound } = await import("next/navigation");
  const user = await getOrCreateUserFromClerk();
  const { isAdmin } = await import("@/lib/admin-gate");
  if (!user || !isAdmin(user)) notFound();
  return <HealthClient userId={user!.id} />;
}

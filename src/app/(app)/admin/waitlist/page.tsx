import { Metadata } from "next";
import dynamic from "next/dynamic";
import { getOrCreateUserFromClerk } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Waitlist — Atlas Admin",
};

const WaitlistClient = dynamic(() => import("./waitlist-client").then((m) => m.WaitlistClient));

export default async function WaitlistPage() {
  const { notFound } = await import("next/navigation");
  const user = await getOrCreateUserFromClerk();
  const { isAdmin } = await import("@/lib/admin-gate");
  if (!user || !isAdmin(user)) notFound();

  return <WaitlistClient />;
}

import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getOrCreateUserFromClerk } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Waitlist — Atlas Admin",
};

const WaitlistClient = dynamic(() =>
  import("./waitlist-client").then((m) => m.WaitlistClient),
);

export default async function WaitlistPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user.email.trim().toLowerCase() !== adminEmail) {
    redirect("/");
  }

  return <WaitlistClient />;
}

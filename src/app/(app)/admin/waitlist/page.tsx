import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { WaitlistClient } from "./waitlist-client";

export const metadata: Metadata = {
  title: "Waitlist — Atlas Admin",
};

export default async function WaitlistPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user.email.trim().toLowerCase() !== adminEmail) {
    redirect("/");
  }

  return <WaitlistClient />;
}

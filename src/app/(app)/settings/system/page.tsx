import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System — Settings — Atlas",
};

export default async function SettingsSystemPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  redirect("/settings?section=system");
}

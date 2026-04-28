import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { HealthClient } from "./health-client";

export const metadata: Metadata = {
  title: "Health — Atlas Admin",
};

export default async function HealthPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");
  return <HealthClient userId={user.id} />;
}

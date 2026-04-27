import { Metadata } from "next";
import { getServerSession } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { HealthClient } from "./health-client";

export const metadata: Metadata = {
  title: "Health — Atlas Admin",
};

export default async function HealthPage() {
  const user = await getServerSession();
  if (!user) redirect("/sign-in");
  return <HealthClient userId={user.id} />;
}

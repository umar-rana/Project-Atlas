import { Metadata } from "next";
import { getServerSession } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { UsageClient } from "./usage-client";

export const metadata: Metadata = {
  title: "AI Usage — Atlas",
};

export default async function UsagePage() {
  const user = await getServerSession();
  if (!user) redirect("/sign-in");
  return <UsageClient />;
}

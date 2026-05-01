import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getOrCreateUserFromClerk } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Health — Atlas Admin",
};

const HealthClient = dynamic(() =>
  import("./health-client").then((m) => m.HealthClient),
);

export default async function HealthPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");
  return <HealthClient userId={user.id} />;
}

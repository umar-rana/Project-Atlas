import { getServerSession } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { HomeClient } from "./home-client";

export default async function HomePage() {
  const user = await getServerSession();
  if (!user) redirect("/sign-in");
  return <HomeClient user={user} />;
}

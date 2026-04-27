import { getServerSession } from "@/core/auth/session";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const user = await getServerSession();
  if (!user) redirect("/sign-in");
  redirect("/tasks");
}

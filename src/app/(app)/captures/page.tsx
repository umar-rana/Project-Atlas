import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { CapturesList } from "@/components/captures/captures-list";

export const metadata: Metadata = {
  title: "Captures — Atlas",
};

export default async function CapturesPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CapturesList />
    </div>
  );
}

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { MediaInbox } from "@/components/media/media-inbox";

export const metadata: Metadata = {
  title: "Media — Atlas",
};

export default async function MediaPage() {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MediaInbox />
    </div>
  );
}

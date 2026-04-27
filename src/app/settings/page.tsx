import { Metadata } from "next";
import { getServerSession } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Settings — Atlas",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerSession();
  if (!user) redirect("/sign-in");

  const params = await searchParams;
  const autoOpenWizard = params.drive_linked === "1";
  const driveLinked = params.drive_linked === "1";
  const driveError = typeof params.drive_error === "string" ? params.drive_error : undefined;

  return (
    <SettingsClient
      user={user}
      autoOpenWizard={autoOpenWizard}
      driveLinked={driveLinked}
      driveError={driveError}
    />
  );
}

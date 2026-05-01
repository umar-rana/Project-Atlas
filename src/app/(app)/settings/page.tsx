import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getOrCreateUserFromClerk } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings — Atlas",
};

const SettingsClient = dynamic(() =>
  import("./settings-client").then((m) => m.SettingsClient),
);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  const params = await searchParams;
  const autoOpenWizard = params.drive_linked === "1";
  const driveLinked = params.drive_linked === "1";
  const driveError = typeof params.drive_error === "string" ? params.drive_error : undefined;
  const section = typeof params.section === "string" ? params.section : undefined;

  return (
    <SettingsClient
      user={user}
      autoOpenWizard={autoOpenWizard}
      driveLinked={driveLinked}
      driveError={driveError}
      initialSection={section}
    />
  );
}

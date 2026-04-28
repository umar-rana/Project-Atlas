import { Metadata } from "next";
import { getServerSession } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { CaptureLogsClient } from "./logs-client";

export const metadata: Metadata = {
  title: "Capture Overrides — Atlas",
};

export default async function CaptureLogsPage() {
  const user = await getServerSession();
  if (!user) redirect("/sign-in");
  return <CaptureLogsClient />;
}

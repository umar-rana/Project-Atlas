import { Metadata } from "next";
import { CaptureLogsClient } from "./logs-client";

export const metadata: Metadata = {
  title: "Capture Overrides — Atlas",
};

export default async function CaptureLogsPage() {
  return <CaptureLogsClient />;
}

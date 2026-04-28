import { Metadata } from "next";
import { UsageClient } from "./usage-client";

export const metadata: Metadata = {
  title: "AI Usage — Atlas",
};

export default async function UsagePage() {
  return <UsageClient />;
}

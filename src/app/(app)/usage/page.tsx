import { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "AI Usage — Atlas",
};

const UsageClient = dynamic(() =>
  import("./usage-client").then((m) => m.UsageClient),
);

export default async function UsagePage() {
  return <UsageClient />;
}

import type { Metadata } from "next";
import { AdminRecoveryDetailClient } from "./recovery-detail-client";

export const metadata: Metadata = {
  title: "Recovery Detail — Atlas Admin",
};

export default async function AdminRecoveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminRecoveryDetailClient id={id} />;
}

import type { Metadata } from "next";
import { AdminOrphanDetailClient } from "./orphan-detail-client";

export const metadata: Metadata = {
  title: "Orphan Investigation — Atlas Admin",
};

export default async function AdminOrphanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminOrphanDetailClient id={id} />;
}

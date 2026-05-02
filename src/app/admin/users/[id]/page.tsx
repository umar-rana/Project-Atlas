import type { Metadata } from "next";
import { AdminUserDetailClient } from "./user-detail-client";

export const metadata: Metadata = {
  title: "User Detail — Atlas Admin",
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminUserDetailClient id={id} />;
}

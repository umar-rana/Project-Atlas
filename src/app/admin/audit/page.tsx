import type { Metadata } from "next";
import { AdminAuditClient } from "./audit-client";

export const metadata: Metadata = {
  title: "Audit Log — Atlas Admin",
};

export default function AdminAuditPage() {
  return <AdminAuditClient />;
}

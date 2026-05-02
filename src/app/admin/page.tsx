import type { Metadata } from "next";
import { AdminDashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard — Atlas Admin",
};

export default function AdminDashboardPage() {
  return <AdminDashboardClient />;
}

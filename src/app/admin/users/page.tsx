import type { Metadata } from "next";
import { AdminUsersClient } from "./users-client";

export const metadata: Metadata = {
  title: "Users — Atlas Admin",
};

export default function AdminUsersPage() {
  return <AdminUsersClient />;
}

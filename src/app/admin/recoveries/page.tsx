import type { Metadata } from "next";
import { AdminRecoveriesClient } from "./recoveries-client";

export const metadata: Metadata = {
  title: "Recoveries — Atlas Admin",
};

export default function AdminRecoveriesPage() {
  return <AdminRecoveriesClient />;
}

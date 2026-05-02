import type { Metadata } from "next";
import { JobsManagement } from "@/components/settings/jobs-management";

export const metadata: Metadata = {
  title: "Jobs — Atlas Admin",
};

export default function AdminJobsPage() {
  return (
    <div>
      <h1 className="mb-1 font-mono text-lg font-semibold text-white">Jobs</h1>
      <p className="mb-6 font-mono text-sm text-white/40">
        Scheduled background job runner status.
      </p>
      <JobsManagement />
    </div>
  );
}

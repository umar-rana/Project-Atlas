import { Metadata } from "next";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "AI Usage — Atlas",
};

function UsagePageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <Skeleton variant="text" width="8rem" height="1.75rem" />
      </div>

      <section className="mb-8">
        <Skeleton variant="text" width="4rem" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1"
            >
              <Skeleton variant="text" width="50%" className="mb-3" />
              <div className="flex flex-col gap-2">
                <Skeleton variant="line" width="70%" />
                <Skeleton variant="line" width="55%" />
                <Skeleton variant="line" width="45%" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Skeleton variant="text" width="10rem" className="mb-3" />
        <div className="overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-1">
          <div className="border-b border-border-subtle px-4 py-3">
            <Skeleton variant="text" width="100%" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="border-b border-border-subtle px-4 py-3 last:border-b-0"
            >
              <Skeleton variant="line" width="100%" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const UsageClient = dynamic(
  () => import("./usage-client").then((m) => m.UsageClient),
  { loading: () => <UsagePageSkeleton /> },
);

export default async function UsagePage() {
  return <UsageClient />;
}

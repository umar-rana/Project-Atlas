"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// PersonForm is ~129 KB minified and is only reached from /people/new
// and /people/[id]/edit. Dynamic-importing keeps it out of the shared
// client baseline chunk (audit perf-bundle-h).
const PersonForm = dynamic(
  () => import("@/components/people/person-form").then((m) => m.PersonForm),
  {
    ssr: false,
    loading: () => <PersonFormSkeleton />,
  },
);

function PersonFormSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Skeleton variant="text" width="12rem" className="mb-6" />
      <div className="space-y-4">
        <Skeleton variant="block" />
        <Skeleton variant="block" />
        <Skeleton variant="block" />
      </div>
    </div>
  );
}

export default function NewPersonPage() {
  return <PersonForm mode="create" />;
}

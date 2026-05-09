"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

// See people/new/page.tsx — same form, same chunk-splitting goal.
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

export default function EditPersonPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <PersonForm mode="edit" personId={params.id} />;
}

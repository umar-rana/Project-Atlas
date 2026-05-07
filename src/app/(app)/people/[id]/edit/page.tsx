"use client";

import React from "react";
import { useParams } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";

export default function EditPersonPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <PersonForm mode="edit" personId={params.id} />;
}

import { Suspense } from "react";
import { PeopleClient } from "./people-client";

export const metadata = { title: "People — Atlas" };

export default function PeoplePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-text-tertiary text-sm">Loading…</div>}>
      <PeopleClient />
    </Suspense>
  );
}

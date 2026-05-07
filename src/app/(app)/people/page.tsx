import { Suspense } from "react";
import { PeopleClient } from "./people-client";

export const metadata = { title: "People — Atlas" };

export default function PeoplePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
          Loading…
        </div>
      }
    >
      <PeopleClient />
    </Suspense>
  );
}

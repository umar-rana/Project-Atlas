import { Metadata } from "next";
import { SavedCapturesClient } from "./saved-client";

export const metadata: Metadata = {
  title: "Saved Captures — Atlas",
};

export default async function SavedCapturesPage() {
  return <SavedCapturesClient />;
}

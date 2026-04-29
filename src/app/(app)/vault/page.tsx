import { Vault } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";

export const metadata = { title: "Vault — Atlas" };

export default function VaultPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Vault size={28} aria-hidden />}
        title="Vault — coming in Phase 2"
        body="Secure storage for life-essential records: passports, deeds, asset ownership, legal documents, digital credentials. Encrypted, intentional, built for things you want to keep forever. Coming in Phase 2."
      />
    </div>
  );
}

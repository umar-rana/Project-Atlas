import { DesktopOnlyPage } from "@/components/mobile/desktop-only-page";

export const metadata = { title: "Vault — Atlas" };

export default function MobileVaultPage() {
  return (
    <DesktopOnlyPage
      title="Vault"
      description="The Vault is optimized for desktop use. Switch to the desktop site to access your vault."
      variant="desktop-only"
      desktopHref="/vault"
    />
  );
}

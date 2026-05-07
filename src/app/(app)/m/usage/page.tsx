import { DesktopOnlyPage } from "@/components/mobile/desktop-only-page";

export const metadata = { title: "Usage — Atlas" };

export default function MobileUsagePage() {
  return (
    <DesktopOnlyPage
      title="AI Usage"
      description="Detailed AI usage stats are best viewed on desktop."
      variant="desktop-only"
      desktopHref="/usage"
    />
  );
}

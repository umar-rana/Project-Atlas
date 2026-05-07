import { DesktopOnlyPage } from "@/components/mobile/desktop-only-page";

export const metadata = { title: "People — Atlas" };

export default function MobilePeoplePage() {
  return (
    <DesktopOnlyPage
      title="People"
      description="A full People interface is coming to mobile soon. For now, manage your contacts on desktop."
      variant="coming-soon"
      desktopHref="/people"
    />
  );
}

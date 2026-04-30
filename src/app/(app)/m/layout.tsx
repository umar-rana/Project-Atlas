import * as React from "react";
import { BottomTabBar } from "@/components/mobile/bottom-tab-bar";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-base text-text-primary">
      <MobileTopBar />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <BottomTabBar />
    </div>
  );
}

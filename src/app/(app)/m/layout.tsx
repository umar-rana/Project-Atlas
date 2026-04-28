import * as React from "react";
import { BottomTabBar } from "@/components/mobile/bottom-tab-bar";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-base text-text-primary">
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      <BottomTabBar />
    </div>
  );
}

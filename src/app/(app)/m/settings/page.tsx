"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Monitor, LogOut, Palette, User, Info } from "lucide-react";
import { useClerk, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

function SettingsRow({
  icon: Icon,
  label,
  sublabel,
  onClick,
  destructive,
}: {
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left",
        "transition-colors active:bg-surface-hover",
        destructive ? "text-accent-danger" : "text-text-primary",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          destructive ? "bg-accent-danger/10" : "bg-surface-raised",
        )}
      >
        <Icon size={16} aria-hidden className={destructive ? "text-accent-danger" : "text-text-secondary"} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-ui text-sm font-medium">{label}</p>
        {sublabel ? (
          <p className="font-ui text-xs text-text-tertiary">{sublabel}</p>
        ) : null}
      </div>
    </button>
  );
}

export default function MobileSettingsPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();

  function switchToDesktop() {
    document.cookie = "prefer-desktop=1; path=/; max-age=31536000; SameSite=Lax";
    router.push("/tasks");
  }

  function handleSignOut() {
    void signOut({ redirectUrl: "/sign-in" });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {user ? (
          <div className="border-b border-border-subtle px-4 py-4">
            <div className="flex items-center gap-3">
              {user.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised font-ui text-lg font-semibold text-text-secondary">
                  {(user.firstName?.[0] ?? user.emailAddresses[0]?.emailAddress?.[0] ?? "?").toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-ui text-base font-semibold text-text-primary">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.firstName ?? "User"}
                </p>
                <p className="truncate font-ui text-sm text-text-tertiary">
                  {user.primaryEmailAddress?.emailAddress}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-2">
          <p className="px-4 pb-1 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Display
          </p>
          <div className="divide-y divide-border-subtle rounded-none">
            <SettingsRow
              icon={Monitor}
              label="Switch to desktop site"
              sublabel="Use the full Atlas app on this device"
              onClick={switchToDesktop}
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="px-4 pb-1 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
            More settings
          </p>
          <div className="divide-y divide-border-subtle">
            <SettingsRow
              icon={User}
              label="Profile & account"
              sublabel="Manage your profile on the desktop site"
              onClick={() => {
                switchToDesktop();
                router.push("/settings?section=profile");
              }}
            />
            <SettingsRow
              icon={Palette}
              label="Appearance"
              sublabel="Theme and display options"
              onClick={() => {
                switchToDesktop();
                router.push("/settings?section=appearance");
              }}
            />
            <SettingsRow
              icon={Info}
              label="All settings"
              sublabel="Open full settings on desktop"
              onClick={switchToDesktop}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="divide-y divide-border-subtle">
            <SettingsRow
              icon={LogOut}
              label="Sign out"
              onClick={handleSignOut}
              destructive
            />
          </div>
        </div>

        <p className="px-4 py-6 font-ui text-xs text-text-disabled text-center">
          Atlas · Mobile
        </p>
      </div>
    </div>
  );
}

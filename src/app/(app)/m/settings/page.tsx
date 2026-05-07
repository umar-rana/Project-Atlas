"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Monitor, LogOut, User, Info, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useClerk, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

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
        <Icon
          size={16}
          aria-hidden
          className={destructive ? "text-accent-danger" : "text-text-secondary"}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-ui text-sm font-medium">{label}</p>
        {sublabel ? <p className="font-ui text-xs text-text-tertiary">{sublabel}</p> : null}
      </div>
    </button>
  );
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function ThemeRow() {
  const { theme, setTheme } = useTheme();

  function handleTheme(value: "light" | "dark" | "system") {
    setTheme(value);
    toast.success(`Theme: ${value.charAt(0).toUpperCase() + value.slice(1)}`, { duration: 2000 });
  }

  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
        {theme === "light" ? (
          <Sun size={16} aria-hidden className="text-text-secondary" />
        ) : theme === "dark" ? (
          <Moon size={16} aria-hidden className="text-text-secondary" />
        ) : (
          <Monitor size={16} aria-hidden className="text-text-secondary" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-2 font-ui text-sm font-medium text-text-primary">Theme</p>
        <div className="flex gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 font-ui text-xs font-medium transition-colors",
                theme === value
                  ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                  : "border-border-subtle bg-surface-raised text-text-secondary active:bg-surface-hover",
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
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
                <Image
                  src={user.imageUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised font-ui text-lg font-semibold text-text-secondary">
                  {(
                    user.firstName?.[0] ??
                    user.emailAddresses[0]?.emailAddress?.[0] ??
                    "?"
                  ).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-ui text-base font-semibold text-text-primary">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : (user.firstName ?? "User")}
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
          <div className="divide-y divide-border-subtle">
            <ThemeRow />
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
              icon={Info}
              label="All settings"
              sublabel="Open full settings on desktop"
              onClick={switchToDesktop}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="divide-y divide-border-subtle">
            <SettingsRow icon={LogOut} label="Sign out" onClick={handleSignOut} destructive />
          </div>
        </div>

        <p className="px-4 py-6 text-center font-ui text-xs text-text-disabled">Atlas · Mobile</p>
      </div>
    </div>
  );
}

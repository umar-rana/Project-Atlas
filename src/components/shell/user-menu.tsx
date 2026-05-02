"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Settings, Activity, Keyboard, LogOut, Sun, Moon, Monitor, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useShellStore } from "@/lib/shell/store";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

interface UserMenuProps {
  name: string | null;
  email: string;
  image: string | null;
  isAdmin?: boolean;
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function UserMenu({ name, email, image, isAdmin }: UserMenuProps): React.ReactElement {
  const router = useRouter();
  const { signOut } = useClerk();
  const setShortcutsOverlayOpen = useShellStore((s) => s.setShortcutsOverlayOpen);
  const { theme, setTheme } = useTheme();

  const initials = (name ?? email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handleSignOut() {
    toast("Signing out…", { duration: 2000 });
    setTimeout(() => { signOut({ redirectUrl: "/sign-in" }); }, 600);
  }

  function handleTheme(value: "light" | "dark" | "system") {
    setTheme(value);
    toast.success(`Theme: ${value.charAt(0).toUpperCase() + value.slice(1)}`, { duration: 2000 });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="User menu"
          className="inline-flex rounded-full focus-visible:focus-ring"
        >
          <Avatar src={image ?? undefined} initials={initials} size="md" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-2">
          <p className="truncate font-ui text-sm font-semibold text-text-primary">{name ?? email.split("@")[0]}</p>
          <p className="truncate font-ui text-xs text-text-tertiary">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-1 font-ui text-2xs font-medium uppercase tracking-wider text-text-tertiary">
          Theme
        </DropdownMenuLabel>
        <div className="flex gap-1 px-2 pb-1">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTheme(value)}
              title={label}
              aria-pressed={theme === value}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 font-ui text-2xs transition-colors",
                theme === value
                  ? "bg-accent-primary-subtle text-accent-primary"
                  : "text-text-tertiary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              <Icon size={13} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings size={14} /> Settings
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => router.push("/admin")}>
              <Activity size={14} /> Admin Panel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/admin/health")}>
              <Activity size={14} /> Health
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/admin/waitlist")}>
              <Users size={14} /> Waitlist
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={() => setShortcutsOverlayOpen(true)}>
          <Keyboard size={14} /> Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={handleSignOut}>
          <LogOut size={14} /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: "light" | "dark" | "system"; label: string; Icon: React.ElementType }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeSwitcher(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : "system";

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-stretch gap-px rounded-md border border-border-subtle bg-surface-sunken p-0.5",
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-22 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors duration-fast ease-standard",
              selected
                ? "bg-surface-raised text-text-primary shadow-1"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={12} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

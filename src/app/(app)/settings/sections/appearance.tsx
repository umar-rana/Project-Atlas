"use client";

import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc/client";
import { SectionHeader } from "./_shared";

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const utils = trpc.useUtils();
  const updateMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  function handleSetTheme(t: "dark" | "light" | "system") {
    setTheme(t);
    updateMutation.mutate({ theme: t });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Appearance" description="Control how Atlas looks." />
      <div>
        <label className="mb-3 block font-ui text-xs font-medium text-text-secondary">Theme</label>
        <div className="flex gap-3">
          {(["dark", "light", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleSetTheme(t)}
              className={`flex-1 rounded-xl border px-4 py-4 font-ui text-sm font-medium capitalize transition-colors ${
                theme === t
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t === "dark" ? "🌙 Dark" : t === "light" ? "☀️ Light" : "🖥 System"}
            </button>
          ))}
        </div>
        <p className="mt-2 font-ui text-xs text-text-tertiary">
          System follows your OS preference automatically.
        </p>
      </div>
    </div>
  );
}

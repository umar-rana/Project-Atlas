"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export function ThemeCookieSync(): null {
  const { theme, resolvedTheme } = useTheme();
  React.useEffect(() => {
    const value = theme === "system" ? "system" : (resolvedTheme ?? theme);
    if (!value) return;
    document.cookie = `atlas_theme=${value};path=/;max-age=31536000;SameSite=Lax`;
  }, [theme, resolvedTheme]);
  return null;
}

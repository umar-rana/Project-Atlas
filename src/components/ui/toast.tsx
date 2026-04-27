"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast as sonnerToast, type ToasterProps } from "sonner";

/**
 * Tracks the Atlas data-theme attribute so Sonner picks the matching surface.
 * Falls back to "dark" (Atlas default) when running before hydration.
 */
function useAtlasTheme(): "dark" | "light" {
  const read = React.useCallback(
    (): "dark" | "light" =>
      typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
        ? "light"
        : "dark",
    [],
  );
  const [theme, setTheme] = React.useState<"dark" | "light">(read);
  React.useEffect(() => {
    setTheme(read());
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [read]);
  return theme;
}

/**
 * Atlas toast surface. Wraps Sonner so callers consume one API.
 *
 * Pattern (per Stratum PATTERNS.md):
 *  - Bottom-right stack, max 3 visible.
 *  - Success auto-dismisses, errors persist until clicked.
 *  - Theme follows the Atlas data-theme attribute (not OS preference) so
 *    surfaces stay consistent with the rest of the app.
 */
export function Toaster(props: ToasterProps): React.ReactElement {
  const theme = useAtlasTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      visibleToasts={3}
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-surface-overlay text-text-primary border border-border-default rounded-lg shadow-3 font-ui text-xs",
          title: "font-semibold text-sm text-text-primary",
          description: "text-text-secondary",
          actionButton: "bg-accent-primary text-text-on-accent",
          cancelButton: "bg-surface-raised text-text-secondary",
          closeButton: "bg-surface-raised text-text-tertiary",
          success: "[&_[data-icon]]:text-accent-success",
          warning: "[&_[data-icon]]:text-accent-warning",
          error: "[&_[data-icon]]:text-accent-danger",
          info: "[&_[data-icon]]:text-accent-info",
        },
      }}
      {...props}
    />
  );
}

export const toast = sonnerToast;

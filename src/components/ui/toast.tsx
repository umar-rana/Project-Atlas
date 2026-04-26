"use client";

import { Toaster as SonnerToaster, toast as sonnerToast, type ToasterProps } from "sonner";

/**
 * Atlas toast surface. Wraps Sonner so callers consume one API.
 *
 * Pattern (per Stratum PATTERNS.md):
 *  - Bottom-right stack, max 3 visible.
 *  - Success auto-dismisses, errors persist until clicked.
 */
export function Toaster(props: ToasterProps): React.ReactElement {
  return (
    <SonnerToaster
      theme="system"
      position="bottom-right"
      visibleToasts={3}
      duration={6000}
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

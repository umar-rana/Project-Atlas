"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "right" | "left";
  width?: number | string;
}

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(function DrawerContent({ className, side = "right", width = 360, style, children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-drawer-backdrop bg-surface-scrim-drawer data-[state=open]:animate-atlas-fade-in" />
      <DialogPrimitive.Content
        ref={ref}
        style={{ width, ...style }}
        className={cn(
          "fixed inset-y-0 z-drawer flex max-w-screen-mobile flex-col bg-surface-overlay shadow-4",
          side === "right"
            ? "right-0 border-l border-border-default data-[state=open]:animate-atlas-drawer-in-r"
            : "left-0 border-r border-border-default data-[state=open]:animate-atlas-drawer-in-l",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export interface DrawerHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function DrawerHeader({
  className,
  pinned,
  onTogglePin,
  children,
  ...props
}: DrawerHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border-subtle px-4 py-3",
        className,
      )}
      {...props}
    >
      <div className="flex-1">{children}</div>
      {onTogglePin ? (
        <button
          type="button"
          aria-label={pinned ? "Unpin" : "Pin"}
          aria-pressed={pinned ? true : undefined}
          onClick={onTogglePin}
          className="inline-flex size-22 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
        >
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
      ) : null}
      <DrawerClose
        aria-label="Close"
        className="inline-flex size-22 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
      >
        <X size={14} />
      </DrawerClose>
    </div>
  );
}

export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("m-0 font-ui text-md font-semibold text-text-primary", className)}
      {...props}
    />
  );
});

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-auto px-4 py-4", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

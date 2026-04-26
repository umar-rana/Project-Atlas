"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(function AlertDialogContent({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-modal-backdrop bg-surface-scrim-modal backdrop-blur-overlay data-[state=open]:animate-atlas-fade-in" />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-modal-top z-modal-content w-modal-base max-w-modal-alert -translate-x-1/2 rounded-xl border border-border-default bg-surface-overlay shadow-4 data-[state=open]:animate-atlas-modal-in",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
});

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-4 pb-2 pt-4", className)} {...props} />;
}

export function AlertDialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("m-0 font-ui text-md font-semibold text-text-primary", className)}
      {...props}
    />
  );
});

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("font-ui text-sm leading-relaxed text-text-secondary", className)}
      {...props}
    />
  );
});

/**
 * Footer slots: per Stratum confirms pattern, the destructive verb is the
 * LEFT button (primary danger), Cancel is right and outlined. This component
 * lays them out automatically.
 */
export function AlertDialogFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-border-subtle px-4 py-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(function AlertDialogAction({ variant = "destructive", ...props }, ref) {
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button ref={ref} variant={variant} {...props} />
    </AlertDialogPrimitive.Action>
  );
});

export const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(function AlertDialogCancel({ variant = "secondary", className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Cancel asChild>
      <Button ref={ref} variant={variant} className={cn("ml-auto", className)} {...props} />
    </AlertDialogPrimitive.Cancel>
  );
});

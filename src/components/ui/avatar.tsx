"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "relative inline-flex shrink-0 overflow-hidden rounded-full border border-border-subtle bg-accent-primary-muted text-text-primary font-semibold align-middle",
  {
    variants: {
      size: {
        xs: "size-4 text-4xs",
        sm: "size-5 text-3xs",
        md: "size-6 text-2xs",
        lg: "size-8 text-xs",
        xl: "size-12 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const statusDotVariants = cva(
  "absolute -bottom-px -right-px size-2 rounded-full border-2 border-surface-base",
  {
    variants: {
      status: {
        online: "bg-accent-success",
        busy: "bg-accent-warning",
        away: "bg-text-tertiary",
        offline: "bg-text-disabled",
      },
    },
  },
);

export interface AvatarProps
  extends
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  initials?: string;
  status?: "online" | "busy" | "away" | "offline";
}

export const Avatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  function Avatar({ className, size, src, alt, initials, status, ...props }, ref) {
    return (
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(avatarVariants({ size }), className)}
        {...props}
      >
        {src ? (
          <AvatarPrimitive.Image
            src={src}
            alt={alt ?? initials ?? ""}
            className="size-full object-cover"
          />
        ) : null}
        <AvatarPrimitive.Fallback className="flex size-full items-center justify-center">
          {initials ?? alt?.slice(0, 2).toUpperCase() ?? "?"}
        </AvatarPrimitive.Fallback>
        {status ? <span aria-hidden className={statusDotVariants({ status })} /> : null}
      </AvatarPrimitive.Root>
    );
  },
);

export interface AvatarStackProps extends React.HTMLAttributes<HTMLDivElement> {
  max?: number;
  total?: number;
  size?: AvatarProps["size"];
  children: React.ReactNode;
}

export function AvatarStack({
  max = 4,
  total,
  size = "sm",
  className,
  children,
  ...props
}: AvatarStackProps): React.ReactElement {
  const list = React.Children.toArray(children);
  const visible = list.slice(0, max);
  const overflow = (total ?? list.length) - visible.length;
  return (
    <div className={cn("inline-flex items-center pl-1.25", className)} {...props}>
      {visible.map((child, i) => (
        <span key={i} className="-ml-1.25 rounded-full outline outline-2 outline-surface-base">
          {React.isValidElement<AvatarProps>(child) ? React.cloneElement(child, { size }) : child}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            "-ml-1.25 inline-flex items-center justify-center rounded-full bg-surface-active font-mono text-3xs font-semibold text-text-secondary outline outline-2 outline-surface-base",
            avatarVariants({ size }),
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

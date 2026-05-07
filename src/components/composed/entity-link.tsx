"use client";

import * as React from "react";
import {
  CheckSquare,
  FileText,
  Folder,
  StickyNote,
  Tag as TagIcon,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EntityKind = "project" | "task" | "note" | "doc" | "person" | "tag";

const ENTITY_ICON: Record<EntityKind, LucideIcon> = {
  project: Folder,
  task: CheckSquare,
  note: StickyNote,
  doc: FileText,
  person: User,
  tag: TagIcon,
};

export interface EntityLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  kind: EntityKind;
  label: string;
}

/**
 * EntityLink — `[[entity]] ` style reference. Inline ref-chip within body text.
 */
export function EntityLink({
  kind,
  label,
  className,
  href = "#",
  ...props
}: EntityLinkProps): React.ReactElement {
  const Icon = ENTITY_ICON[kind];
  return (
    <a
      href={href}
      data-kind={kind}
      className={cn(
        "inline-flex h-control-pill items-center gap-1 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-raised px-1.5 align-middle font-ui text-2xs font-medium leading-none text-text-secondary no-underline",
        "transition-colors duration-fast ease-standard",
        "hover:border-border-default hover:text-text-primary",
        "focus-visible:focus-ring",
        className,
      )}
      {...props}
    >
      <Icon size={11} className="text-text-tertiary" aria-hidden />
      {label}
    </a>
  );
}

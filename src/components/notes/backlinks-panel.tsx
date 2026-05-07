"use client";

import * as React from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";

interface Backlink {
  id: string;
  source_type: string;
  source_id: string;
  source_title?: string;
}

interface BacklinksPanelProps {
  backlinks: Backlink[];
}

export function BacklinksPanel({ backlinks }: BacklinksPanelProps): React.ReactElement {
  if (backlinks.length === 0) {
    return <p className="font-ui text-2xs text-text-disabled">No backlinks yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {backlinks.map((link) => {
        const href =
          link.source_type === "Note"
            ? `/notes/${link.source_id}`
            : link.source_type === "Task"
              ? `/tasks?selected=${link.source_id}`
              : "#";
        return (
          <li key={link.id}>
            <Link
              href={href}
              className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 font-ui text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Link2 size={10} className="shrink-0 text-text-tertiary" />
              <span className="truncate">{link.source_title ?? link.source_id}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

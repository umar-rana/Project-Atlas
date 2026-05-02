"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export function ProjectBriefDisplay({ projectId }: { projectId: string }) {
  const { data } = trpc.notes.list.useQuery({
    project_id: projectId,
    is_project_brief: true,
    limit: 1,
  });

  const brief = data?.notes[0];

  if (!brief) return null;

  const excerpt = brief.body_text
    ? brief.body_text.slice(0, 160).replace(/\s+/g, " ").trim()
    : null;

  return (
    <div className="mb-4 rounded-lg border border-border-subtle bg-surface-sunken p-3">
      <div className="mb-1.5 flex items-center gap-1.5 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
        <FileText size={10} />
        Brief
      </div>
      <p className="mb-1 font-ui text-sm font-medium text-text-primary line-clamp-1">
        {brief.title || "Untitled note"}
      </p>
      {excerpt && (
        <p className="mb-2 font-ui text-2xs text-text-secondary line-clamp-2">{excerpt}</p>
      )}
      <Link
        href={`/notes/${brief.id}`}
        className="inline-flex items-center gap-1 font-ui text-2xs text-accent-primary hover:underline"
      >
        Open note <ArrowRight size={10} />
      </Link>
    </div>
  );
}

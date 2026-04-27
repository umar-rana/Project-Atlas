"use client";

import * as React from "react";
import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { trpc } from "@/lib/trpc/client";
import { ProjectAddForm } from "@/components/tasks/project-add-form";
import { EmptyState } from "@/components/composed/empty-state";
import { cn } from "@/lib/utils";

const PROJECT_COLOR_DOTS: Record<string, string> = {
  blue: "bg-cal-1-border",
  green: "bg-cal-2-border",
  amber: "bg-cal-3-border",
  red: "bg-cal-4-border",
  purple: "bg-cal-5-border",
  teal: "bg-cal-6-border",
  pink: "bg-cal-7-border",
  orange: "bg-cal-8-border",
};

export default function ProjectsIndexPage() {
  const projects = trpc.projects.list.useQuery({});
  const [adding, setAdding] = React.useState(false);

  return (
    <TasksShell>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <h1 className="font-ui text-base font-semibold text-text-primary">All projects</h1>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-sm border border-border-default px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
          >
            <Plus size={12} /> New project
          </button>
        </header>

        {adding ? (
          <div className="border-b border-border-subtle bg-surface-raised p-3">
            <ProjectAddForm onDone={() => setAdding(false)} />
          </div>
        ) : null}

        {(projects.data ?? []).length === 0 && !adding ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<Folder size={28} />}
              title="No projects yet"
              body="Group related tasks into projects (sequential or parallel)."
            />
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto">
            {(projects.data ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/tasks/projects/${p.id}`}
                  className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 hover:bg-surface-hover"
                >
                  <span
                    className={cn("size-3 shrink-0 rounded-full", PROJECT_COLOR_DOTS[p.color ?? ""] ?? "bg-text-disabled")}
                    aria-hidden
                  />
                  <span className="flex-1 truncate font-ui text-sm text-text-primary">{p.title}</span>
                  <span className="font-ui text-2xs uppercase tracking-caps text-text-tertiary">{p.status.replace("_", " ")}</span>
                  <span className="font-mono text-2xs text-text-tertiary tabular-nums">{p.task_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TasksShell>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  CalendarDays,
  Flag,
  Folder,
  Hash,
  Tag as TagIcon,
  Trash2,
  Plus,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Search,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";
import { ProjectAddForm } from "./project-add-form";
import { ContextAddForm } from "./context-add-form";

interface NavRowProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  disabled?: boolean;
}

function NavRow({ href, active, icon, label, badge, disabled }: NavRowProps) {
  if (disabled) {
    return (
      <span
        className={cn(
          "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm",
          "cursor-not-allowed text-text-disabled",
        )}
        title="Coming in Wave 3b"
      >
        <span className="shrink-0 text-text-tertiary">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm transition-colors",
        active
          ? "bg-accent-primary-subtle text-text-primary"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      )}
    >
      <span className="shrink-0 text-text-tertiary">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <Badge variant="neutral" count={badge} />
      ) : null}
    </Link>
  );
}

function SectionHeader({
  label,
  expanded,
  onToggle,
  onAdd,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between px-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary hover:text-text-secondary"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${label.toLowerCase()}`}
          className="inline-flex size-4 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <Plus size={11} />
        </button>
      ) : null}
    </div>
  );
}

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

function colorDotClass(color?: string | null): string {
  if (!color) return "bg-text-disabled";
  return PROJECT_COLOR_DOTS[color] ?? "bg-text-disabled";
}

export function TasksSidebar(): React.ReactElement {
  const pathname = usePathname();
  const counts = trpc.tasks.counts.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const projects = trpc.projects.list.useQuery({ status: "active" });
  const contexts = trpc.contexts.list.useQuery();
  const tags = trpc.tags.list.useQuery({ limit: 100 });

  const [projectsOpen, setProjectsOpen] = React.useState(true);
  const [contextsOpen, setContextsOpen] = React.useState(true);
  const [tagsOpen, setTagsOpen] = React.useState(true);
  const [showAllTags, setShowAllTags] = React.useState(false);
  const [addingProject, setAddingProject] = React.useState(false);
  const [addingContext, setAddingContext] = React.useState(false);

  const visibleTags = React.useMemo(() => {
    const list = tags.data ?? [];
    return showAllTags ? list : list.slice(0, 20);
  }, [tags.data, showAllTags]);

  return (
    <nav aria-label="Task perspectives" className="flex h-full flex-col gap-px overflow-y-auto p-2">
      <NavRow
        href="/tasks/inbox"
        active={pathname === "/tasks/inbox"}
        icon={<Inbox size={14} />}
        label="Inbox"
        badge={counts.data?.inbox}
      />
      <NavRow
        href="/tasks/today"
        active={pathname === "/tasks/today"}
        icon={<CalendarDays size={14} />}
        label="Today"
        badge={counts.data?.today}
      />
      <NavRow
        href="/tasks/flagged"
        active={pathname === "/tasks/flagged"}
        icon={<Flag size={14} />}
        label="Flagged"
        badge={counts.data?.flagged}
      />

      <SectionHeader
        label="Projects"
        expanded={projectsOpen}
        onToggle={() => setProjectsOpen(!projectsOpen)}
        onAdd={() => setAddingProject(true)}
      />
      {projectsOpen ? (
        <div className="flex flex-col gap-px">
          <NavRow
            href="/tasks/projects"
            active={pathname === "/tasks/projects"}
            icon={<Folder size={14} />}
            label="All projects"
          />
          {addingProject ? (
            <div className="px-2 py-1">
              <ProjectAddForm onDone={() => setAddingProject(false)} />
            </div>
          ) : null}
          {(projects.data ?? []).map((p) => {
            const href = `/tasks/projects/${p.id}`;
            const active = pathname === href;
            return (
              <Link
                key={p.id}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm",
                  active
                    ? "bg-accent-primary-subtle text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", colorDotClass(p.color))} aria-hidden />
                <span className="flex-1 truncate">{p.title}</span>
                {p.task_count > 0 ? (
                  <span className="font-mono text-2xs text-text-tertiary tabular-nums">{p.task_count}</span>
                ) : null}
              </Link>
            );
          })}
          {projects.data?.length === 0 && !addingProject ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No projects yet</p>
          ) : null}
        </div>
      ) : null}

      <SectionHeader
        label="Contexts"
        expanded={contextsOpen}
        onToggle={() => setContextsOpen(!contextsOpen)}
        onAdd={() => setAddingContext(true)}
      />
      {contextsOpen ? (
        <div className="flex flex-col gap-px">
          {addingContext ? (
            <div className="px-2 py-1">
              <ContextAddForm onDone={() => setAddingContext(false)} />
            </div>
          ) : null}
          {(contexts.data ?? []).map((c) => {
            const href = `/tasks/contexts/${c.id}`;
            const active = pathname === href;
            return (
              <NavRow
                key={c.id}
                href={href}
                active={active}
                icon={<Hash size={14} />}
                label={c.name}
                badge={c.task_count}
              />
            );
          })}
          {contexts.data?.length === 0 && !addingContext ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No contexts yet</p>
          ) : null}
        </div>
      ) : null}

      <SectionHeader
        label="Tags"
        expanded={tagsOpen}
        onToggle={() => setTagsOpen(!tagsOpen)}
      />
      {tagsOpen ? (
        <div className="flex flex-col gap-px">
          {visibleTags.map((t) => {
            const href = `/tasks/tags/${encodeURIComponent(t.name)}`;
            const active = pathname === href;
            return (
              <Link
                key={t.id}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm",
                  active
                    ? "bg-accent-primary-subtle text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <TagIcon size={12} className="text-text-tertiary" />
                <span className="flex-1 truncate">#{t.name}</span>
                {t.usage_count > 0 ? (
                  <span className="font-mono text-2xs text-text-tertiary tabular-nums">{t.usage_count}</span>
                ) : null}
              </Link>
            );
          })}
          {(tags.data?.length ?? 0) > 20 ? (
            <button
              type="button"
              onClick={() => setShowAllTags(!showAllTags)}
              className="px-2 py-1 text-left font-ui text-2xs text-text-tertiary hover:text-text-secondary"
            >
              {showAllTags ? "Show top 20" : "Show all tags"}
            </button>
          ) : null}
          {tags.data?.length === 0 ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No tags yet</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-px border-t border-border-subtle pt-2">
        <NavRow
          href="/tasks/trash"
          active={pathname === "/tasks/trash"}
          icon={<Trash2 size={14} />}
          label="Trash"
          badge={counts.data?.trash}
        />
        <NavRow href="#" active={false} icon={<CheckCircle2 size={14} />} label="Completed" disabled />
        <NavRow href="#" active={false} icon={<Search size={14} />} label="Forecast" disabled />
        <NavRow href="#" active={false} icon={<RefreshCw size={14} />} label="Review" disabled />
      </div>
    </nav>
  );
}

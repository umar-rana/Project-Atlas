"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { SectionHeader, useSidebarSection } from "./section-header";
import { colorDotClass } from "@/components/tasks/folder-tree-node";

interface TagsSectionProps {
  pathname: string;
}

export function TagsSection({ pathname }: TagsSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useSidebarSection("tags", false);
  const [showAll, setShowAll] = React.useState(false);

  const tags = trpc.tags.list.useQuery({ limit: 100 }, { refetchOnWindowFocus: false });
  const tagsCount = trpc.tags.count.useQuery(undefined, { refetchOnWindowFocus: false });

  const visible = React.useMemo(() => {
    const list = tags.data ?? [];
    return showAll ? list : list.slice(0, 20);
  }, [tags.data, showAll]);

  return (
    <>
      <SectionHeader
        label="Tags"
        expanded={open}
        onToggle={() => setOpen(!open)}
        onManage={() => router.push("/tasks/tags/manage")}
        count={tagsCount.data?.count}
      />
      {open ? (
        <div className="flex flex-col gap-px">
          {visible.map((t) => {
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
                <span className={cn("size-2 shrink-0 rounded-full", colorDotClass(t.color))} aria-hidden />
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
              onClick={() => setShowAll(!showAll)}
              className="px-2 py-1 text-left font-ui text-2xs text-text-tertiary hover:text-text-secondary"
            >
              {showAll ? "Show top 20" : "Show all tags"}
            </button>
          ) : null}
          {tags.data?.length === 0 ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No tags yet</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

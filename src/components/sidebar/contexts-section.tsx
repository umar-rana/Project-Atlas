"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { SectionHeader, useSidebarSection } from "./section-header";
import { ContextAddForm } from "@/components/tasks/context-add-form";
import { NavRow } from "./nav-row";

interface ContextsSectionProps {
  pathname: string;
}

export function ContextsSection({ pathname }: ContextsSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useSidebarSection("contexts", false);
  const [adding, setAdding] = React.useState(false);

  const contexts = trpc.contexts.list.useQuery();

  return (
    <>
      <SectionHeader
        label="Contexts"
        expanded={open}
        onToggle={() => setOpen(!open)}
        onAdd={() => setAdding(true)}
        onManage={() => router.push("/tasks/contexts/manage")}
        count={contexts.data?.length}
      />
      {open ? (
        <div className="flex flex-col gap-px">
          {adding ? (
            <div className="px-2 py-1">
              <ContextAddForm onDone={() => setAdding(false)} />
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
          {contexts.data?.length === 0 && !adding ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No contexts yet</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

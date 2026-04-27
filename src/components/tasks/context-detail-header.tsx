"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";

export function ContextDetailHeader({
  contextId,
}: {
  contextId: string;
}): React.ReactElement | null {
  const router = useRouter();
  const utils = trpc.useUtils();
  const list = trpc.contexts.list.useQuery();
  const ctx = list.data?.find((c) => c.id === contextId);

  const update = trpc.contexts.update.useMutation({
    onSettled: () => utils.contexts.list.invalidate(),
  });
  const del = trpc.contexts.delete.useMutation({
    onSuccess: () => {
      toast.success("Context deleted");
      router.push("/tasks/inbox");
    },
    onSettled: () => {
      utils.contexts.list.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });

  const [titleDraft, setTitleDraft] = React.useState("");
  React.useEffect(() => {
    if (ctx) setTitleDraft(ctx.name);
  }, [ctx?.name, ctx]);

  if (!ctx) return null;

  function commitTitle() {
    if (!ctx) return;
    const next = titleDraft.trim().replace(/^@/, "");
    if (next && next !== ctx.name) {
      update.mutate({ id: ctx.id, name: next });
    } else {
      setTitleDraft(ctx.name);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2">
      <span className="font-display text-base text-text-tertiary" aria-hidden>
        @
      </span>
      <input
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-base font-semibold text-text-primary outline-none"
      />
      <span className="font-mono text-2xs text-text-tertiary tabular-nums">
        {ctx.task_count} {ctx.task_count === 1 ? "task" : "tasks"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          aria-label="Context actions"
        >
          <MoreHorizontal size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            destructive
            onSelect={() => {
              if (confirm("Delete context? Tasks will keep their other contexts and tags.")) {
                del.mutate({ id: ctx.id });
              }
            }}
          >
            Delete context
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

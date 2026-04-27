"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { parseQuickAdd } from "@/lib/tasks/parse-quick-add";
import { useTasksStore } from "@/lib/tasks/store";
import { toast } from "@/lib/toast";

interface TaskQuickAddProps {
  defaultProjectId?: string | null;
  defaultContextId?: string;
  defaultTagName?: string;
  placeholder?: string;
}

export function TaskQuickAdd({
  defaultProjectId,
  defaultContextId,
  defaultTagName,
  placeholder = "Add a task — Enter to save, ⌘⏎ to open inspector",
}: TaskQuickAddProps): React.ReactElement {
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);

  const tags = trpc.tags.list.useQuery({ limit: 500 });
  const contexts = trpc.contexts.list.useQuery();
  const tagCreate = trpc.tags.create.useMutation();
  const contextCreate = trpc.contexts.create.useMutation();
  const create = trpc.tasks.create.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tags.list.invalidate();
      utils.contexts.list.invalidate();
    },
  });

  async function submit(openInspector: boolean) {
    const txt = value.trim();
    if (!txt) return;
    const parsed = parseQuickAdd(txt);
    if (!parsed.title) {
      toast.error("Task needs a title");
      return;
    }

    const knownTags = tags.data ?? [];
    const knownContexts = contexts.data ?? [];

    const tagIds: string[] = [];
    const contextIds: string[] = [];
    if (defaultTagName) {
      const t = knownTags.find((x) => x.name === defaultTagName.toLowerCase());
      if (t) tagIds.push(t.id);
    }
    if (defaultContextId) contextIds.push(defaultContextId);

    try {
      for (const t of parsed.tags) {
        const existing = knownTags.find((x) => x.name === t);
        if (existing) tagIds.push(existing.id);
        else {
          const created = await tagCreate.mutateAsync({ name: t });
          tagIds.push(created.id);
        }
      }
      for (const c of parsed.contexts) {
        const existing = knownContexts.find((x) => x.name.toLowerCase() === c.toLowerCase());
        if (existing) {
          contextIds.push(existing.id);
          continue;
        }
        try {
          const created = await contextCreate.mutateAsync({ name: c });
          contextIds.push(created.id);
        } catch (err) {
          // Race: another tab/request created the same context first.
          // Re-fetch and reuse it instead of failing the capture.
          const code =
            err && typeof err === "object" && "data" in err
              ? (err as { data?: { code?: string } }).data?.code
              : undefined;
          if (code === "CONFLICT") {
            const refreshed = await utils.contexts.list.fetch();
            const found = refreshed.find((x) => x.name.toLowerCase() === c.toLowerCase());
            if (found) {
              contextIds.push(found.id);
              continue;
            }
          }
          throw err;
        }
      }

      // If the user typed a `>>project` token but we already have a
      // default scope (e.g. inside a project view), the explicit
      // project_id wins. Otherwise the server resolves project_title.
      const hasReferenceTokens = /(^|\s)(@\w|\[\[)/.test(txt);
      const created = await create.mutateAsync({
        title: parsed.title,
        notes: hasReferenceTokens ? txt : undefined,
        project_id: defaultProjectId ?? undefined,
        project_title: defaultProjectId ? undefined : parsed.project_title,
        due_date: parsed.due_date ?? null,
        tag_ids: tagIds,
        context_ids: contextIds,
      });

      setValue("");
      if (openInspector) {
        setSelectedTaskId(created.id);
      }
      // Stay focused for rapid capture.
      inputRef.current?.focus();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Could not add task");
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(e.metaKey || e.ctrlKey);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-raised px-3 py-2">
      <Plus size={14} className="text-text-tertiary" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-ui text-sm text-text-primary outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}

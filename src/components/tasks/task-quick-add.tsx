"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
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

  const tags = trpc.tags.list.useQuery({ limit: 500 }, { enabled: !!defaultTagName });

  const parseAndCreate = trpc.capture.parseAndCreate.useMutation({
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

    const contextIdOverrides: string[] = defaultContextId ? [defaultContextId] : [];
    const tagIdOverrides: string[] = [];

    if (defaultTagName && tags.data) {
      const t = tags.data.find((x) => x.name === defaultTagName.toLowerCase());
      if (t) tagIdOverrides.push(t.id);
    }

    try {
      const result = await parseAndCreate.mutateAsync({
        raw_text: txt,
        source: "quick_add",
        project_id_override: defaultProjectId ?? undefined,
        context_id_overrides: contextIdOverrides.length > 0 ? contextIdOverrides : undefined,
        tag_id_overrides: tagIdOverrides.length > 0 ? tagIdOverrides : undefined,
      });

      setValue("");
      if (openInspector) {
        setSelectedTaskId(result.taskId);
      }
      inputRef.current?.focus();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Could not add task");
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(e.metaKey || e.ctrlKey);
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

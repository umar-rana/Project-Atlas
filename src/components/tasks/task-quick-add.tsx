"use client";

import * as React from "react";
import { Plus, LayoutTemplate, X as XIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { TemplatePicker } from "@/components/task-templates/template-picker";
import type { TemplateFields } from "@/components/task-templates/template-picker";

interface PendingTemplate {
  id: string;
  fields: TemplateFields;
}

interface TaskQuickAddProps {
  defaultProjectId?: string | null;
  defaultContextId?: string;
  defaultTagName?: string;
  defaultDueDate?: string;
  placeholder?: string;
}

export function TaskQuickAdd({
  defaultProjectId,
  defaultContextId,
  defaultTagName,
  defaultDueDate,
  placeholder = "Add a task — Enter to save, ⌘⏎ to open inspector",
}: TaskQuickAddProps): React.ReactElement {
  const [value, setValue] = React.useState("");
  const [pendingTemplate, setPendingTemplate] = React.useState<PendingTemplate | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const tags = trpc.tags.list.useQuery({ limit: 500 }, { enabled: !!defaultTagName });

  const parseAndCreate = trpc.capture.parseAndCreate.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tags.list.invalidate();
      utils.contexts.list.invalidate();
    },
  });

  const instantiateTemplate = trpc.taskTemplates.instantiate.useMutation();

  async function submit() {
    const txt = value.trim();

    if (pendingTemplate) {
      const { id, fields } = pendingTemplate;
      const contextIds = defaultContextId ? [defaultContextId] : fields.context_ids;
      const tagIds = fields.tag_ids;
      try {
        await instantiateTemplate.mutateAsync({
          id,
          overrides: {
            title: txt || fields.title,
            project_id: defaultProjectId ?? fields.default_project_id ?? null,
            context_ids: contextIds,
            tag_ids: tagIds,
          },
        });
        utils.tasks.list.invalidate();
        utils.tasks.counts.invalidate();
        void utils.taskTemplates.list.invalidate();
        toast.success("Task created from template");
        setValue("");
        setPendingTemplate(null);
        inputRef.current?.focus();
      } catch (err) {
        toast.error((err as { message?: string })?.message ?? "Could not create task from template");
      }
      return;
    }

    if (!txt) return;

    const contextIdOverrides: string[] = defaultContextId ? [defaultContextId] : [];
    const tagIdOverrides: string[] = [];

    if (defaultTagName && tags.data) {
      const t = tags.data.find((x) => x.name === defaultTagName.toLowerCase());
      if (t) tagIdOverrides.push(t.id);
    }

    try {
      await parseAndCreate.mutateAsync({
        raw_text: txt,
        source: "quick_add",
        project_id_override: defaultProjectId ?? undefined,
        context_id_overrides: contextIdOverrides.length > 0 ? contextIdOverrides : undefined,
        tag_id_overrides: tagIdOverrides.length > 0 ? tagIdOverrides : undefined,
        due_date_override: defaultDueDate,
      });

      setValue("");
      inputRef.current?.focus();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Could not add task");
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
    if (e.key === "Escape" && pendingTemplate) {
      setPendingTemplate(null);
    }
  }

  function handleTemplateSelect(fields: TemplateFields, templateId: string) {
    setPendingTemplate({ id: templateId, fields });
    setValue(fields.title);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col border-b border-border-subtle bg-surface-raised">
      {pendingTemplate && (
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1">
          <LayoutTemplate size={11} className="text-accent-primary" aria-hidden />
          <span className="font-ui text-2xs text-accent-primary">
            Template: {pendingTemplate.fields.title}
          </span>
          <button
            type="button"
            aria-label="Clear template"
            onClick={() => { setPendingTemplate(null); setValue(""); inputRef.current?.focus(); }}
            className="ml-auto text-text-disabled hover:text-text-secondary"
          >
            <XIcon size={11} aria-hidden />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <Plus size={14} className="text-text-tertiary" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={pendingTemplate ? "Edit task title (Enter to save)…" : placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-ui text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <TemplatePicker onSelect={handleTemplateSelect} side="bottom" align="end" />
      </div>
    </div>
  );
}

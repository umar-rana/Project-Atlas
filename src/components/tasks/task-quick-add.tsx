"use client";

import * as React from "react";
import { Plus, LayoutTemplate, X as XIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { TemplatePicker } from "@/components/task-templates/template-picker";
import type { TemplateFields } from "@/components/task-templates/template-picker";
import { parseInlineTaskText } from "@/lib/parsing/inline-task-parser";
import { useTasksStore } from "@/lib/tasks/store";

interface PendingTemplate {
  id: string;
  fields: TemplateFields;
}

interface TaskQuickAddProps {
  defaultProjectId?: string | null;
  defaultContextId?: string;
  defaultTagName?: string;
  defaultDueDate?: string;
  /** Apply `flagged: true` to created tasks (e.g. on the Flagged view). */
  defaultFlagged?: boolean;
  placeholder?: string;
}

/**
 * "Add a task" input for /tasks/* views. Per the Direct Entity Creation
 * Routing CR (§3.2) this calls `tasks.create` DIRECTLY — no Capture entity
 * is created. Inline parsing (chrono-node + #tag / ~~ctx / >>project) is
 * applied via parseInlineTaskText.
 *
 * Capture-first surfaces (topbar `+`, ⌘⇧I, mobile `+`, email-to-inbox) live
 * elsewhere and continue to route through capture.parseAndCreate.
 */
export function TaskQuickAdd({
  defaultProjectId,
  defaultContextId,
  defaultTagName,
  defaultDueDate,
  defaultFlagged,
  placeholder = "Add a task — Enter to save, ⌘⏎ to open inspector",
}: TaskQuickAddProps): React.ReactElement {
  const [value, setValue] = React.useState("");
  const [pendingTemplate, setPendingTemplate] = React.useState<PendingTemplate | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);

  // Tag/context/project resolution: we look up by name client-side and
  // drop unknowns silently (CR rule 8.4 — no auto-create from inline syntax).
  const tagsQuery = trpc.tags.list.useQuery({ limit: 500 });
  const contextsQuery = trpc.contexts.list.useQuery();
  const projectsQuery = trpc.projects.list.useQuery({});

  const createTask = trpc.tasks.create.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tags.list.invalidate();
      utils.contexts.list.invalidate();
      utils.projects.list.invalidate();
    },
  });

  const instantiateTemplate = trpc.taskTemplates.instantiate.useMutation();

  async function submit(openInspector: boolean = false) {
    const txt = value.trim();

    if (pendingTemplate) {
      const { id, fields } = pendingTemplate;
      const contextIds = defaultContextId ? [defaultContextId] : fields.context_ids;
      const tagIds = fields.tag_ids;
      try {
        const created = await instantiateTemplate.mutateAsync({
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
        // CR §3.2.2 — ⌘+Enter opens the inspector for refinement after
        // the task has already been created. The task is always saved;
        // the inspector is just refinement.
        if (openInspector && created?.id) {
          setSelectedTaskId(created.id);
        }
      } catch (err) {
        toast.error(
          (err as { message?: string })?.message ?? "Could not create task from template",
        );
      }
      return;
    }

    if (!txt) return;

    // ── Inline parsing (CR §3.2.1, §3.2.4) ──────────────────────────────
    const parsed = parseInlineTaskText(txt);

    // ── Resolve tag NAMES → IDs (existing tags only; unknowns dropped) ──
    const tagNameSet = new Set(parsed.tags.map((n) => n.toLowerCase()));
    if (defaultTagName) tagNameSet.add(defaultTagName.toLowerCase());
    const resolvedTagIds: string[] = [];
    for (const tag of tagsQuery.data ?? []) {
      if (tagNameSet.has(tag.name.toLowerCase())) resolvedTagIds.push(tag.id);
    }

    // ── Resolve context NAMES → IDs ─────────────────────────────────────
    const resolvedContextIds: string[] = [];
    const ctxNameSet = new Set(parsed.contexts.map((n) => n.toLowerCase()));
    for (const ctx of contextsQuery.data ?? []) {
      if (ctxNameSet.has(ctx.name.toLowerCase())) resolvedContextIds.push(ctx.id);
    }
    if (defaultContextId && !resolvedContextIds.includes(defaultContextId)) {
      resolvedContextIds.push(defaultContextId);
    }

    // ── Resolve project TITLE → id (case-insensitive exact; unknown dropped) ──
    let resolvedProjectId: string | null | undefined = defaultProjectId ?? undefined;
    if (parsed.project_title) {
      const wanted = parsed.project_title.toLowerCase();
      const hit = (projectsQuery.data ?? []).find(
        (p: { id: string; title: string }) => p.title.toLowerCase() === wanted,
      );
      if (hit) resolvedProjectId = hit.id;
      // If the title doesn't match anything, silently drop it per CR §3.2.4 / 8.4.
    }

    // ── View-default due date, parsed phrase wins (CR rule 8.8) ─────────
    const dueDate =
      parsed.due_date ?? (defaultDueDate ? new Date(defaultDueDate) : undefined);
    // CP-8 — propagate the inline parser's has_time flag through to
    // tasks.create so direct entry like "Call dentist tomorrow at 3pm"
    // persists a time-bearing task. The view-default fallback path
    // (no parser date) is always date-only.
    const dueHasTime = parsed.due_date ? (parsed.due_date_has_time ?? false) : false;

    try {
      const created = await createTask.mutateAsync({
        title: parsed.title || txt,
        project_id: resolvedProjectId,
        context_ids: resolvedContextIds.length > 0 ? resolvedContextIds : undefined,
        tag_ids: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
        due_date: dueDate ?? undefined,
        due_date_has_time: dueDate ? dueHasTime : undefined,
        flagged: defaultFlagged || undefined,
      });

      setValue("");
      inputRef.current?.focus();
      // CR §3.2.2 — ⌘+Enter opens the inspector for refinement after
      // the task has already been created.
      if (openInspector && created?.id) {
        setSelectedTaskId(created.id);
      }
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Could not add task");
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // ⌘+Enter (mac) / Ctrl+Enter (win/linux) creates the task AND
      // opens the inspector. Plain Enter just creates.
      const openInspector = e.metaKey || e.ctrlKey;
      void submit(openInspector);
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
            onClick={() => {
              setPendingTemplate(null);
              setValue("");
              inputRef.current?.focus();
            }}
            className="ml-auto text-text-disabled hover:text-text-secondary"
          >
            <XIcon size={11} aria-hidden />
          </button>
        </div>
      )}
      <div
        className="flex items-center gap-2 px-3 py-2"
        title="Creates a task with this view's defaults — does not enter the Capture inbox"
      >
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

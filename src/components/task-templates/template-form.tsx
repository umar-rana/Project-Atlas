"use client";

import * as React from "react";
import { X, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TemplateNotesEditor } from "./template-notes-editor";

interface ChecklistItem {
  id?: string;
  title: string;
  position: string;
}

interface TemplateFormValues {
  name: string;
  notes: string;
  default_project_id: string;
  estimated_minutes: string;
  flagged: boolean;
  recurrence_rule: string;
  context_ids: string[];
  tag_ids: string[];
  checklist_items: ChecklistItem[];
}

interface TemplateFormProps {
  initialValues?: Partial<TemplateFormValues>;
  onSuccess: () => void;
  onCancel: () => void;
  editId?: string;
}

function emptyForm(): TemplateFormValues {
  return {
    name: "",
    notes: "",
    default_project_id: "",
    estimated_minutes: "",
    flagged: false,
    recurrence_rule: "",
    context_ids: [],
    tag_ids: [],
    checklist_items: [],
  };
}

export function TemplateForm({
  initialValues,
  onSuccess,
  onCancel,
  editId,
}: TemplateFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const [form, setForm] = React.useState<TemplateFormValues>({
    ...emptyForm(),
    ...initialValues,
  });
  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");

  const projects = trpc.projects.list.useQuery({ status: "active" });
  const contexts = trpc.contexts.list.useQuery();
  const tags = trpc.tags.list.useQuery({ limit: 500 });

  const create = trpc.taskTemplates.create.useMutation({
    onSuccess: () => {
      utils.taskTemplates.list.invalidate();
      toast.success("Template created");
      onSuccess();
    },
    onError: (err) => toast.error(err.message ?? "Failed to create template"),
  });

  const update = trpc.taskTemplates.update.useMutation({
    onSuccess: () => {
      utils.taskTemplates.list.invalidate();
      toast.success("Template updated");
      onSuccess();
    },
    onError: (err) => toast.error(err.message ?? "Failed to update template"),
  });

  const isPending = create.isPending || update.isPending;

  function set<K extends keyof TemplateFormValues>(key: K, value: TemplateFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addChecklistItem() {
    const title = newChecklistTitle.trim();
    if (!title) return;
    const pos = ((form.checklist_items.length + 1) * 1024).toString();
    set("checklist_items", [...form.checklist_items, { title, position: pos }]);
    setNewChecklistTitle("");
  }

  function removeChecklistItem(idx: number) {
    set("checklist_items", form.checklist_items.filter((_, i) => i !== idx));
  }

  function moveChecklistItem(idx: number, direction: "up" | "down") {
    const items = [...form.checklist_items];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    [items[idx], items[targetIdx]] = [items[targetIdx]!, items[idx]!];
    const reposioned = items.map((item, i) => ({
      ...item,
      position: ((i + 1) * 1024).toString(),
    }));
    set("checklist_items", reposioned);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }

    const payload = {
      name,
      notes: form.notes || null,
      default_project_id: form.default_project_id || null,
      estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes, 10) : null,
      flagged: form.flagged,
      recurrence_rule: form.recurrence_rule || null,
      context_ids: form.context_ids,
      tag_ids: form.tag_ids,
      checklist_items: form.checklist_items.map((item, idx) => ({
        title: item.title,
        position: item.position || ((idx + 1) * 1024).toString(),
      })),
    };

    if (editId) {
      update.mutate({ id: editId, ...payload });
    } else {
      create.mutate(payload);
    }
  }

  function toggleContext(id: string) {
    set(
      "context_ids",
      form.context_ids.includes(id)
        ? form.context_ids.filter((c) => c !== id)
        : [...form.context_ids, id],
    );
  }

  function toggleTag(id: string) {
    set(
      "tag_ids",
      form.tag_ids.includes(id)
        ? form.tag_ids.filter((t) => t !== id)
        : [...form.tag_ids, id],
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-xs font-medium text-text-secondary">
          Template name <span className="text-accent-danger">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Weekly Review"
          className="rounded-md border border-border-default bg-surface-raised px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-border-focus"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-xs font-medium text-text-secondary">Notes</label>
        <TemplateNotesEditor
          value={form.notes}
          onChange={(v) => set("notes", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-xs font-medium text-text-secondary">Default project</label>
          <select
            value={form.default_project_id}
            onChange={(e) => set("default_project_id", e.target.value)}
            className="rounded-md border border-border-default bg-surface-raised px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            <option value="">None</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-xs font-medium text-text-secondary">Estimated time (min)</label>
          <input
            type="number"
            min="0"
            max="43200"
            value={form.estimated_minutes}
            onChange={(e) => set("estimated_minutes", e.target.value)}
            placeholder="e.g. 30"
            className="rounded-md border border-border-default bg-surface-raised px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-xs font-medium text-text-secondary">Recurrence rule</label>
          <input
            type="text"
            value={form.recurrence_rule}
            onChange={(e) => set("recurrence_rule", e.target.value)}
            placeholder="RRULE:FREQ=WEEKLY;…"
            className="rounded-md border border-border-default bg-surface-raised px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
        </div>

        <div className="flex flex-col gap-1.5 justify-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.flagged}
              onChange={(e) => set("flagged", e.target.checked)}
              className="h-4 w-4 rounded border-border-default text-accent-primary focus:ring-border-focus"
            />
            <span className="font-ui text-xs font-medium text-text-secondary">Flagged</span>
          </label>
        </div>
      </div>

      {(contexts.data ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-xs font-medium text-text-secondary">Contexts</label>
          <div className="flex flex-wrap gap-1.5">
            {(contexts.data ?? []).map((ctx) => (
              <button
                key={ctx.id}
                type="button"
                onClick={() => toggleContext(ctx.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-xs transition-colors",
                  form.context_ids.includes(ctx.id)
                    ? "bg-accent-primary-muted text-accent-primary font-medium"
                    : "border border-border-default text-text-secondary hover:bg-surface-hover",
                )}
              >
                {ctx.icon && <span>{ctx.icon}</span>}
                {ctx.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {(tags.data ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-xs font-medium text-text-secondary">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {(tags.data ?? []).slice(0, 30).map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 font-ui text-xs transition-colors",
                  form.tag_ids.includes(tag.id)
                    ? "bg-accent-primary-muted text-accent-primary font-medium"
                    : "border border-border-default text-text-secondary hover:bg-surface-hover",
                )}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-xs font-medium text-text-secondary">Checklist items</label>
        <div className="flex flex-col gap-1">
          {form.checklist_items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveChecklistItem(idx, "up")}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="h-3 text-text-disabled hover:text-text-secondary disabled:opacity-30 transition-colors"
                >
                  <ChevronUp size={11} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => moveChecklistItem(idx, "down")}
                  disabled={idx === form.checklist_items.length - 1}
                  aria-label="Move down"
                  className="h-3 text-text-disabled hover:text-text-secondary disabled:opacity-30 transition-colors"
                >
                  <ChevronDown size={11} aria-hidden />
                </button>
              </div>
              <span className="flex-1 font-ui text-sm text-text-primary">{item.title}</span>
              <button
                type="button"
                onClick={() => removeChecklistItem(idx)}
                aria-label={`Remove "${item.title}"`}
                className="text-text-disabled hover:text-accent-danger transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newChecklistTitle}
              onChange={(e) => setNewChecklistTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChecklistItem();
                }
              }}
              placeholder="Add checklist item…"
              className="flex-1 rounded-md border border-border-default bg-surface-raised px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
            <button
              type="button"
              onClick={addChecklistItem}
              disabled={!newChecklistTitle.trim()}
              className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-default px-4 py-2 font-ui text-sm text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !form.name.trim()}
          className="rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : editId ? "Update template" : "Create template"}
        </button>
      </div>
    </form>
  );
}

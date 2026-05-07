"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, LayoutTemplate } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { TemplateForm } from "./template-form";
import { Hint } from "@/components/ui/hint";
import { useLocale } from "@/core/locale/hooks";
import { formatDate } from "@/core/locale/formatters";

export function TemplatesSettingsSection(): React.ReactElement {
  const utils = trpc.useUtils();
  const locale = useLocale();
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const { data: templates, isLoading } = trpc.taskTemplates.list.useQuery(
    { limit: 200 },
    { staleTime: 10_000 },
  );

  const deleteTemplate = trpc.taskTemplates.delete.useMutation({
    onSuccess: () => {
      utils.taskTemplates.list.invalidate();
      toast.success("Template deleted");
      setDeletingId(null);
    },
    onError: (err) => toast.error(err.message ?? "Failed to delete template"),
  });

  const editingTemplate = editingId ? templates?.find((t) => t.id === editingId) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-ui text-sm font-semibold text-text-primary">Task Templates</h2>
          <p className="mt-0.5 font-ui text-xs text-text-secondary">
            Reusable task shapes that pre-fill the new-task form.
          </p>
        </div>
        <Hint label="Create template" side="left">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover transition-colors"
          >
            <Plus size={13} aria-hidden />
            New template
          </button>
        </Hint>
      </div>

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <span className="font-ui text-sm text-text-tertiary">Loading templates…</span>
        </div>
      )}

      {!isLoading && (!templates || templates.length === 0) && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-default py-12 text-center">
          <LayoutTemplate size={32} className="text-text-disabled" aria-hidden />
          <div>
            <p className="font-ui text-sm font-medium text-text-secondary">No templates yet</p>
            <p className="mt-0.5 font-ui text-xs text-text-tertiary">
              Create a template to quickly pre-fill new tasks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Plus size={12} aria-hidden />
            Create first template
          </button>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border-default">
          <table className="w-full">
            <thead className="border-b border-border-subtle bg-surface-sunken">
              <tr>
                <th className="px-4 py-2.5 text-left font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Default project
                </th>
                <th className="px-4 py-2.5 text-right font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Used
                </th>
                <th className="px-4 py-2.5 text-right font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Last used
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface-raised">
              {templates.map((template) => (
                <tr key={template.id} className="group">
                  <td className="px-4 py-3">
                    <span className="font-ui text-sm text-text-primary">{template.name}</span>
                    {template.checklist_items.length > 0 && (
                      <span className="ml-1.5 font-ui text-2xs text-text-tertiary">
                        · {template.checklist_items.length} checklist item
                        {template.checklist_items.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-ui text-xs text-text-secondary">
                      {template.default_project?.title ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-ui text-xs text-text-tertiary tabular-nums">
                      {template.usage_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-ui text-xs text-text-tertiary">
                      {template.last_used_at
                        ? formatDate(new Date(template.last_used_at), locale)
                        : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Hint label="Edit template" side="top">
                        <button
                          type="button"
                          onClick={() => setEditingId(template.id)}
                          aria-label={`Edit ${template.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                      </Hint>
                      <Hint label="Delete template" side="top">
                        <button
                          type="button"
                          onClick={() => setDeletingId(template.id)}
                          aria-label={`Delete ${template.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-accent-danger transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </Hint>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create task template</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <TemplateForm
              onSuccess={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingId !== null}
        onOpenChange={(open) => { if (!open) setEditingId(null); }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {editingTemplate && (
              <TemplateForm
                editId={editingTemplate.id}
                initialValues={{
                  name: editingTemplate.name,
                  notes: editingTemplate.notes ?? "",
                  default_project_id: editingTemplate.default_project_id ?? "",
                  estimated_minutes: editingTemplate.estimated_minutes?.toString() ?? "",
                  flagged: editingTemplate.flagged,
                  recurrence_rule: editingTemplate.recurrence_rule ?? "",
                  context_ids: editingTemplate.contexts.map((c) => c.context_id),
                  tag_ids: editingTemplate.tags.map((t) => t.tag_id),
                  checklist_items: editingTemplate.checklist_items.map((item) => ({
                    title: item.title,
                    position: item.position.toString(),
                  })),
                }}
                onSuccess={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This template will be permanently removed. Existing tasks created from it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTemplate.isPending}
              onClick={() => {
                if (deletingId) deleteTemplate.mutate({ id: deletingId });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import * as React from "react";
import { format } from "date-fns";
import { Flag, X, Trash2, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/ui/tag";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { InboxProcessingSuggestions } from "./inbox-processing-suggestions";
import { TaskInspectorAttachments } from "./task-inspector-attachments";
import { TaskInspectorActivityTab } from "./task-inspector-activity-tab";
import { TaskInspectorSubtasks } from "./task-inspector-subtasks";
// Flat structural types mirroring the shape selected by the tasks.get
// router (TASK_INCLUDE). We avoid `RouterOutputs["tasks"]["get"]` here
// because Prisma's deeply-typed include trees push tsc into TS2589
// "excessively deep" errors. Keeping the shape narrow at the boundary
// is intentional and sourced from the router shape.
interface InspectorContextLink {
  context: { id: string; name: string };
}
interface InspectorTagLink {
  tag: { id: string; name: string };
}
interface InspectorSubtask {
  id: string;
  status: string;
  title: string;
}
interface InspectorTask {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  flagged: boolean;
  project_id: string | null;
  estimated_minutes: number | null;
  defer_date: Date | string | null;
  due_date: Date | string | null;
  contexts: InspectorContextLink[];
  tags: InspectorTagLink[];
  subtasks?: InspectorSubtask[];
  referenced_entity_refs: unknown;
}
type EntityRef = { kind: string; id: string; label: string };

function isEntityRefArray(value: unknown): value is EntityRef[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (v) =>
      v != null &&
      typeof v === "object" &&
      typeof (v as { kind?: unknown }).kind === "string" &&
      typeof (v as { id?: unknown }).id === "string" &&
      typeof (v as { label?: unknown }).label === "string",
  );
}

interface TaskInspectorProps {
  taskId: string;
  inTrash?: boolean;
}

function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delay: number) {
  const ref = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  return React.useCallback(
    (...args: Parameters<T>) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay],
  );
}

function fmtDateForInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "yyyy-MM-dd");
}

export function TaskInspector({ taskId, inTrash }: TaskInspectorProps): React.ReactElement {
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const utils = trpc.useUtils();
  const task = trpc.tasks.get.useQuery(
    { id: taskId, includeDeleted: inTrash ?? false },
    { staleTime: 1000 },
  );
  const projects = trpc.projects.list.useQuery({ status: "active" });
  const contexts = trpc.contexts.list.useQuery();
  const tags = trpc.tags.list.useQuery({ limit: 500 });
  const tagCreate = trpc.tags.create.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
  });
  const update = trpc.tasks.update.useMutation({
    onError: () => toast.error("Save failed — try again"),
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
    },
  });

  const restore = trpc.tasks.restore.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      setSelectedTaskId(null);
    },
  });
  const hardDelete = trpc.tasks.hardDelete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      setSelectedTaskId(null);
    },
  });
  const del = trpc.tasks.delete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      setSelectedTaskId(null);
    },
  });
  const complete = trpc.tasks.complete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
    },
  });
  const uncomplete = trpc.tasks.uncomplete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
    },
  });
  const parseLog = trpc.capture.getLogForTask.useQuery(
    { task_id: taskId },
    { staleTime: 60_000, enabled: Boolean(taskId) },
  );
  const logParseOverride = trpc.capture.logParseOverride.useMutation();

  const data = task.data;

  const debouncedUpdate = useDebouncedCallback(
    (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch),
    600,
  );

  const [tab, setTab] = React.useState<"detail" | "activity">("detail");
  const [titleDraft, setTitleDraft] = React.useState("");
  const [notesDraft, setNotesDraft] = React.useState("");
  const [newTagInput, setNewTagInput] = React.useState("");

  const dataId = data?.id;
  const dataTitle = data?.title;
  const dataNotes = data?.notes;
  React.useEffect(() => {
    if (dataTitle !== undefined) setTitleDraft(dataTitle);
    if (dataNotes !== undefined) setNotesDraft(dataNotes ?? "");
  }, [dataId, dataTitle, dataNotes]);

  if (task.isLoading || !data) {
    return (
      <aside className="flex h-full w-full flex-col border-l border-border-subtle bg-surface-overlay">
        <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <h2 className="font-ui text-sm font-semibold text-text-primary">Inspector</h2>
          <button
            type="button"
            aria-label="Close inspector"
            onClick={() => setSelectedTaskId(null)}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex flex-1 items-center justify-center font-ui text-2xs text-text-tertiary">Loading…</div>
      </aside>
    );
  }

  const taskData: InspectorTask = data;
  const selectedContextIds = taskData.contexts.map((c) => c.context.id);
  const selectedTagIds = taskData.tags.map((t) => t.tag.id);

  function patchContexts(nextIds: string[]) {
    update.mutate({ id: taskData.id, context_ids: nextIds });
    const hint = parseLog.data;
    if (hint && Array.isArray(hint.contexts) && hint.contexts.length > 0) {
      const hintNames = [...hint.contexts].map((n) => n.toLowerCase()).sort();
      const newNames = nextIds
        .map((id) => (contexts.data ?? []).find((c) => c.id === id)?.name ?? "")
        .filter(Boolean)
        .map((n) => n.toLowerCase())
        .sort();
      const differs = JSON.stringify(hintNames) !== JSON.stringify(newNames);
      if (differs) {
        logParseOverride.mutate({ task_id: taskData.id, field: "contexts" });
      }
    }
  }
  function patchTags(nextIds: string[]) {
    update.mutate({ id: taskData.id, tag_ids: nextIds });
    const hint = parseLog.data;
    if (hint && Array.isArray(hint.tags) && hint.tags.length > 0) {
      const hintNames = [...hint.tags].map((n) => n.toLowerCase()).sort();
      const newNames = nextIds
        .map((id) => (tags.data ?? []).find((t) => t.id === id)?.name ?? "")
        .filter(Boolean)
        .map((n) => n.toLowerCase())
        .sort();
      const differs = JSON.stringify(hintNames) !== JSON.stringify(newNames);
      if (differs) {
        logParseOverride.mutate({ task_id: taskData.id, field: "tags" });
      }
    }
  }

  async function addNewTag() {
    const name = newTagInput.trim().replace(/^#/, "").toLowerCase();
    if (!name) return;
    const existing = (tags.data ?? []).find((t) => t.name === name);
    let id = existing?.id;
    if (!id) {
      const created = await tagCreate.mutateAsync({ name });
      id = created.id;
    }
    if (id && !selectedTagIds.includes(id)) {
      patchTags([...selectedTagIds, id]);
    }
    setNewTagInput("");
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle bg-surface-overlay">
      <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <h2 className="m-0 flex-1 truncate font-ui text-sm font-semibold text-text-primary">
          {inTrash ? "Trashed task" : "Task"}
        </h2>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={() => setSelectedTaskId(null)}
          className="text-text-tertiary hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex border-b border-border-subtle">
        {(["detail", "activity"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-3 py-1.5 font-ui text-xs",
              tab === t ? "border-b-2 border-accent-primary text-text-primary" : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {t === "detail" ? "Details" : "Activity"}
          </button>
        ))}
      </div>

      {tab === "detail" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              size="md"
              checked={taskData.status === "completed"}
              disabled={inTrash}
              onCheckedChange={(v) => {
                if (v) complete.mutate({ id: taskData.id });
                else uncomplete.mutate({ id: taskData.id });
              }}
            />
            <textarea
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                const next = titleDraft.trim();
                if (next && next !== taskData.title) update.mutate({ id: taskData.id, title: next });
              }}
              disabled={inTrash}
              rows={2}
              className="flex-1 resize-none border-0 bg-transparent p-0 font-display text-lg font-medium text-text-primary outline-none focus:ring-0 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => update.mutate({ id: taskData.id, flagged: !taskData.flagged })}
              disabled={inTrash}
              className={cn(
                "rounded-sm p-1",
                taskData.flagged ? "text-accent-warning" : "text-text-tertiary hover:text-text-secondary",
              )}
              aria-label={taskData.flagged ? "Unflag task" : "Flag task"}
            >
              <Flag size={16} fill={taskData.flagged ? "currentColor" : "none"} />
            </button>
          </div>

          {!inTrash && (
            <InboxProcessingSuggestions
              taskId={taskData.id}
              currentProjectId={taskData.project_id}
              currentContextIds={selectedContextIds}
              currentTagIds={selectedTagIds}
              disabled={inTrash}
            />
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 font-ui text-2xs text-text-tertiary">
              Project
              <select
                value={taskData.project_id ?? ""}
                onChange={(e) => {
                  const newProjectId = e.target.value || null;
                  update.mutate({ id: taskData.id, project_id: newProjectId });
                  const hint = parseLog.data;
                  if (hint?.project_hint) {
                    const newTitle = newProjectId
                      ? ((projects.data ?? []).find((p) => p.id === newProjectId)?.title ?? "")
                      : "";
                    const differs = newTitle.toLowerCase() !== hint.project_hint.toLowerCase();
                    if (differs) {
                      logParseOverride.mutate({ task_id: taskData.id, field: "project" });
                    }
                  }
                }}
                disabled={inTrash}
                className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
              >
                <option value="">Inbox</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-ui text-2xs text-text-tertiary">
              Estimated min
              <input
                type="number"
                min={0}
                value={taskData.estimated_minutes ?? ""}
                onChange={(e) => {
                  const num = e.target.value === "" ? null : Number(e.target.value);
                  debouncedUpdate({ id: taskData.id, estimated_minutes: num });
                }}
                disabled={inTrash}
                className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            </label>
            <label className="flex flex-col gap-1 font-ui text-2xs text-text-tertiary">
              Defer
              <input
                type="date"
                value={fmtDateForInput(taskData.defer_date)}
                onChange={(e) =>
                  update.mutate({
                    id: taskData.id,
                    defer_date: e.target.value ? new Date(e.target.value) : null,
                  })
                }
                disabled={inTrash}
                className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            </label>
            <label className="flex flex-col gap-1 font-ui text-2xs text-text-tertiary">
              Due
              <input
                type="date"
                value={fmtDateForInput(taskData.due_date)}
                onChange={(e) =>
                  update.mutate({
                    id: taskData.id,
                    due_date: e.target.value ? new Date(e.target.value) : null,
                  })
                }
                disabled={inTrash}
                className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            </label>
          </div>

          <section className="mt-4">
            <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">Contexts</h3>
            <div className="flex flex-wrap gap-1">
              {(contexts.data ?? []).map((c) => {
                const on = selectedContextIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={inTrash}
                    onClick={() => {
                      const next = on
                        ? selectedContextIds.filter((id) => id !== c.id)
                        : [...selectedContextIds, c.id];
                      patchContexts(next);
                    }}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-ui text-2xs",
                      on
                        ? "border-accent-info bg-accent-info-muted text-accent-info"
                        : "border-border-subtle text-text-tertiary hover:border-border-default",
                    )}
                  >
                    @{c.name}
                  </button>
                );
              })}
              {(contexts.data ?? []).length === 0 ? (
                <span className="font-ui text-2xs text-text-tertiary">No contexts</span>
              ) : null}
            </div>
          </section>

          <section className="mt-4">
            <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">Tags</h3>
            <div className="flex flex-wrap gap-1">
              {taskData.tags.map((t) => (
                <Tag key={t.tag.id} family="freeform" removable onRemove={() => patchTags(selectedTagIds.filter((id) => id !== t.tag.id))}>
                  #{t.tag.name}
                </Tag>
              ))}
              <input
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNewTag();
                  }
                }}
                disabled={inTrash}
                placeholder="#add tag"
                className="min-w-20 flex-1 rounded-sm border border-border-subtle bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            </div>
          </section>

          <section className="mt-4">
            <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">Notes</h3>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== (taskData.notes ?? "")) {
                  update.mutate({ id: taskData.id, notes: notesDraft });
                }
              }}
              disabled={inTrash}
              rows={6}
              placeholder="Notes (Markdown · @person · #tag · [[entity]])"
              className="w-full resize-y rounded-sm border border-border-default bg-surface-base p-2 font-ui text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
            />
          </section>

          <TaskInspectorSubtasks
            parentTaskId={taskData.id}
            parentProjectId={taskData.project_id ?? null}
            subtasks={taskData.subtasks ?? []}
            inTrash={inTrash}
          />

          {(() => {
            const refs: EntityRef[] = isEntityRefArray(taskData.referenced_entity_refs)
              ? taskData.referenced_entity_refs
              : [];
            if (refs.length === 0) return null;
            return (
              <section className="mt-4">
                <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">Linked entities</h3>
                <ul className="flex flex-col gap-1 font-ui text-xs text-text-secondary">
                  {refs.map((r) => (
                    <li key={`${r.kind}:${r.id}`}>
                      [[{r.label}]] <span className="text-text-tertiary">({r.kind})</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}

          <TaskInspectorAttachments taskId={taskData.id} inTrash={inTrash} />

          <footer className="mt-6 flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
            {inTrash ? (
              <>
                <button
                  type="button"
                  onClick={() => restore.mutate({ id: taskData.id })}
                  className="inline-flex items-center gap-1 rounded-sm border border-border-default px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
                >
                  <RotateCcw size={12} /> Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Permanently delete this task?")) hardDelete.mutate({ id: taskData.id });
                  }}
                  className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-accent-danger hover:bg-surface-hover"
                >
                  <Trash2 size={12} /> Delete forever
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => del.mutate({ id: taskData.id })}
                className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-accent-danger hover:bg-surface-hover"
              >
                <Trash2 size={12} /> Move to trash
              </button>
            )}
          </footer>
        </div>
      ) : (
        <TaskInspectorActivityTab taskId={taskData.id} />
      )}
    </aside>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Flag,
  CheckCircle2,
  Clock,
  Users,
  RefreshCw,
  Monitor,
  Calendar,
  X,
  FolderOpen,
  AtSign,
  Tag,
  ChevronRight,
  Check,
  Sparkles,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";
import { setDesktopPreference } from "@/lib/mobile/switch-to-desktop";

interface TaskDetailData {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  flagged: boolean;
  project_id: string | null;
  project: { id: string; title: string; color: string | null } | null;
  estimated_minutes: number | null;
  defer_date: Date | string | null;
  due_date: Date | string | null;
  follow_up_date?: Date | string | null;
  is_someday?: boolean;
  delegated_to_text?: string | null;
  recurrence_rule?: string | null;
  contexts: { context: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string; color: string | null } }[];
  completed_at?: Date | string | null;
  source_capture?: { id: string; raw_text: string; ai_parsed: boolean } | null;
}

function humanizeRecurrence(rule: string | null | undefined): string | null {
  if (!rule) return null;
  if (rule.includes("DAILY")) return "Daily";
  if (rule.includes("WEEKLY")) return "Weekly";
  if (rule.includes("MONTHLY")) return "Monthly";
  if (rule.includes("YEARLY")) return "Yearly";
  return rule;
}

function toDateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return format(date, "yyyy-MM-dd");
}

interface DatePickerSheetProps {
  label: string;
  value: Date | string | null | undefined;
  onSave: (iso: string | null) => void;
  onClose: () => void;
  isPending?: boolean;
}

function DatePickerSheet({ label, value, onSave, onClose, isPending }: DatePickerSheetProps) {
  const [inputValue, setInputValue] = React.useState(toDateInputValue(value));

  return (
    <BottomSheet onClose={onClose} title={label}>
      <input
        type="date"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="h-12 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-ui text-base text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
        autoFocus
      />
      <div className="flex gap-2">
        {value && (
          <button
            type="button"
            onClick={() => onSave(null)}
            disabled={isPending}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-border-subtle font-ui text-sm font-medium text-text-secondary disabled:opacity-40"
          >
            Clear date
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave(inputValue || null)}
          disabled={isPending}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-accent-primary font-ui text-sm font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </BottomSheet>
  );
}

interface TextInputSheetProps {
  label: string;
  placeholder?: string;
  value: string;
  onSave: (value: string | null) => void;
  onClose: () => void;
  isPending?: boolean;
}

function TextInputSheet({ label, placeholder, value, onSave, onClose, isPending }: TextInputSheetProps) {
  const [inputValue, setInputValue] = React.useState(value);

  return (
    <BottomSheet onClose={onClose} title={label}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-ui text-base text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
        autoFocus
      />
      <div className="flex gap-2">
        {value && (
          <button
            type="button"
            onClick={() => onSave(null)}
            disabled={isPending}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-border-subtle font-ui text-sm font-medium text-text-secondary disabled:opacity-40"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave(inputValue.trim() || null)}
          disabled={isPending}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-accent-primary font-ui text-sm font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </BottomSheet>
  );
}

interface ProjectPickerSheetProps {
  currentProjectId: string | null;
  onSave: (projectId: string | null) => void;
  onClose: () => void;
  isPending?: boolean;
}

function ProjectPickerSheet({ currentProjectId, onSave, onClose, isPending }: ProjectPickerSheetProps) {
  const [search, setSearch] = React.useState("");
  const { data: projects = [] } = trpc.projects.list.useQuery({});
  const filtered = search.trim()
    ? projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : projects;

  return (
    <BottomSheet onClose={onClose} title="Project">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search projects…"
        className="h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
        autoFocus
      />
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border-subtle">
        {currentProjectId && (
          <button
            type="button"
            onClick={() => onSave(null)}
            disabled={isPending}
            className="flex min-h-[44px] w-full items-center gap-3 border-b border-border-subtle px-3 py-2 text-left text-accent-danger active:bg-surface-hover"
          >
            <X size={14} aria-hidden />
            <span className="font-ui text-sm">Remove from project</span>
          </button>
        )}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center font-ui text-sm text-text-tertiary">No projects found</p>
        )}
        {filtered.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSave(project.id)}
            disabled={isPending}
            className="flex min-h-[44px] w-full items-center gap-3 border-b border-border-subtle px-3 py-2 text-left last:border-b-0 active:bg-surface-hover"
          >
            <FolderOpen size={14} className="shrink-0 text-text-tertiary" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-ui text-sm text-text-primary">
              {project.title}
            </span>
            {project.id === currentProjectId && (
              <Check size={14} className="shrink-0 text-accent-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

interface ContextPickerSheetProps {
  currentContextIds: string[];
  onSave: (contextIds: string[]) => void;
  onClose: () => void;
  isPending?: boolean;
}

function ContextPickerSheet({ currentContextIds, onSave, onClose, isPending }: ContextPickerSheetProps) {
  const [selected, setSelected] = React.useState<string[]>(currentContextIds);
  const { data: contexts = [] } = trpc.contexts.list.useQuery();

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <BottomSheet onClose={onClose} title="Contexts">
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border-subtle">
        {contexts.length === 0 && (
          <p className="px-3 py-4 text-center font-ui text-sm text-text-tertiary">No contexts found</p>
        )}
        {contexts.map((ctx) => (
          <button
            key={ctx.id}
            type="button"
            onClick={() => toggle(ctx.id)}
            className="flex min-h-[44px] w-full items-center gap-3 border-b border-border-subtle px-3 py-2 text-left last:border-b-0 active:bg-surface-hover"
          >
            <AtSign size={14} className="shrink-0 text-text-tertiary" aria-hidden />
            <span className="min-w-0 flex-1 font-ui text-sm text-text-primary">{ctx.name}</span>
            {selected.includes(ctx.id) && (
              <Check size={14} className="shrink-0 text-accent-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(selected)}
        disabled={isPending}
        className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-accent-primary font-ui text-sm font-semibold text-white disabled:opacity-40"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </BottomSheet>
  );
}

interface TagPickerSheetProps {
  currentTagIds: string[];
  onSave: (tagIds: string[]) => void;
  onClose: () => void;
  isPending?: boolean;
}

function TagPickerSheet({ currentTagIds, onSave, onClose, isPending }: TagPickerSheetProps) {
  const [selected, setSelected] = React.useState<string[]>(currentTagIds);
  const [search, setSearch] = React.useState("");
  const { data: tags = [] } = trpc.tags.list.useQuery();
  const filtered = search.trim()
    ? tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tags;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <BottomSheet onClose={onClose} title="Tags">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tags…"
        className="h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
        autoFocus
      />
      <div className="max-h-60 overflow-y-auto rounded-xl border border-border-subtle">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center font-ui text-sm text-text-tertiary">No tags found</p>
        )}
        {filtered.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className="flex min-h-[44px] w-full items-center gap-3 border-b border-border-subtle px-3 py-2 text-left last:border-b-0 active:bg-surface-hover"
          >
            <Tag size={14} className="shrink-0 text-text-tertiary" aria-hidden />
            <span className="min-w-0 flex-1 font-ui text-sm text-text-primary">#{tag.name}</span>
            {selected.includes(tag.id) && (
              <Check size={14} className="shrink-0 text-accent-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(selected)}
        disabled={isPending}
        className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-accent-primary font-ui text-sm font-semibold text-white disabled:opacity-40"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </BottomSheet>
  );
}

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full rounded-t-2xl bg-surface-base pb-[env(safe-area-inset-bottom)] shadow-xl">
        <div className="mx-auto mb-3 mt-3 h-1 w-10 rounded-full bg-border-default" aria-hidden />
        <div className="flex items-center justify-between px-4 pb-3">
          <p className="font-ui text-sm font-semibold text-text-primary">{title}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-text-tertiary"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3 px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

const ESTIMATE_OPTIONS: { label: string; value: number | null }[] = [
  { label: "None", value: null },
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "2 hr", value: 120 },
];

const RECURRENCE_OPTIONS: { label: string; rule: string | null }[] = [
  { label: "None", rule: null },
  { label: "Daily", rule: "FREQ=DAILY" },
  { label: "Weekly", rule: "FREQ=WEEKLY" },
  { label: "Monthly", rule: "FREQ=MONTHLY" },
  { label: "Yearly", rule: "FREQ=YEARLY" },
];

interface EstimatePickerSheetProps {
  current: number | null;
  onSave: (value: number | null) => void;
  onClose: () => void;
  isPending?: boolean;
}

function EstimatePickerSheet({ current, onSave, onClose, isPending }: EstimatePickerSheetProps) {
  return (
    <BottomSheet onClose={onClose} title="Time estimate">
      <div className="overflow-hidden rounded-xl border border-border-subtle">
        {ESTIMATE_OPTIONS.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSave(opt.value)}
            disabled={isPending}
            className="flex min-h-[48px] w-full items-center justify-between border-b border-border-subtle px-4 py-3 text-left last:border-b-0 active:bg-surface-hover disabled:opacity-40"
          >
            <span className="font-ui text-sm text-text-primary">{opt.label}</span>
            {current === opt.value && (
              <Check size={16} className="text-accent-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

interface RecurrencePickerSheetProps {
  current: string | null | undefined;
  onSave: (rule: string | null) => void;
  onClose: () => void;
  isPending?: boolean;
}

function RecurrencePickerSheet({ current, onSave, onClose, isPending }: RecurrencePickerSheetProps) {
  const currentBase = current?.replace(/^RRULE:/, "") ?? null;
  return (
    <BottomSheet onClose={onClose} title="Recurrence">
      <div className="overflow-hidden rounded-xl border border-border-subtle">
        {RECURRENCE_OPTIONS.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSave(opt.rule)}
            disabled={isPending}
            className="flex min-h-[48px] w-full items-center justify-between border-b border-border-subtle px-4 py-3 text-left last:border-b-0 active:bg-surface-hover disabled:opacity-40"
          >
            <span className="font-ui text-sm text-text-primary">{opt.label}</span>
            {currentBase === opt.rule && (
              <Check size={16} className="text-accent-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

type ActivePicker = "due" | "defer" | "project" | "waiting_for" | "follow_up_date" | "contexts" | "tags" | "title" | "estimated_minutes" | "recurrence" | null;

export default function MobileTaskDetailPage() {
  const locale = useLocale();
  const router = useRouter();
  const { taskId } = useParams<{ taskId: string }>();
  const utils = trpc.useUtils();

  const [activePicker, setActivePicker] = React.useState<ActivePicker>(null);

  const { data: rawTask, isLoading } = trpc.tasks.get.useQuery(
    { id: taskId, includeDeleted: false },
    { staleTime: 1000 },
  );
  const task = rawTask as TaskDetailData | undefined;

  const complete = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.counts.invalidate();
      toast.success("Task completed", {
        action: { label: "Undo", onClick: () => uncomplete.mutate({ id: taskId }) },
        duration: 5000,
      });
      router.push("/m/tasks");
    },
  });

  const uncomplete = trpc.tasks.uncomplete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.counts.invalidate();
    },
  });

  const flag = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.list.invalidate();
    },
  });

  const updateField = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.list.invalidate();
      setActivePicker(null);
      toast.success("Updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const setRecurrence = trpc.tasks.setRecurrence.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      setActivePicker(null);
      toast.success("Recurrence set");
    },
    onError: () => toast.error("Failed to set recurrence"),
  });

  const removeRecurrence = trpc.tasks.removeRecurrence.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      setActivePicker(null);
      toast.success("Recurrence removed");
    },
    onError: () => toast.error("Failed to remove recurrence"),
  });

  const recordFollowUp = trpc.tasks.recordFollowUp.useMutation({
    onSuccess: () => {
      utils.tasks.get.invalidate({ id: taskId });
      setActivePicker(null);
      toast.success("Follow-up date set");
    },
    onError: () => toast.error("Failed to set follow-up date"),
  });

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
          <Link
            href="/m/tasks"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
          >
            <ChevronLeft size={22} />
          </Link>
          <div className="h-4 flex-1 animate-pulse rounded bg-surface-raised" />
        </header>
        <div className="flex-1 space-y-4 px-4 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-raised" />
          ))}
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-ui text-base font-medium text-text-secondary">Task not found</p>
        <Link href="/m/tasks" className="font-ui text-sm text-accent-primary">
          Back to tasks
        </Link>
      </div>
    );
  }

  const isCompleted = task.status === "completed";
  const taskId_ = task.id;
  const isSomeday_ = task.is_someday ?? false;
  const delegatedTo_ = task.delegated_to_text ?? null;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const deferDate = task.defer_date ? new Date(task.defer_date) : null;
  const completedAt = task.completed_at ? new Date(task.completed_at as string) : null;
  const recurrence = humanizeRecurrence(task.recurrence_rule);

  function handleDueSave(iso: string | null) {
    updateField.mutate({ id: taskId_, due_date: iso ? new Date(iso) : null });
  }

  function handleDeferSave(iso: string | null) {
    updateField.mutate({ id: taskId_, defer_date: iso ? new Date(iso) : null });
  }

  function handleSomeDayToggle() {
    updateField.mutate({ id: taskId_, is_someday: !isSomeday_ });
  }

  function handleWaitingForSave(value: string | null) {
    updateField.mutate({ id: taskId_, delegated_to_text: value });
  }

  function handleProjectSave(projectId: string | null) {
    updateField.mutate({ id: taskId_, project_id: projectId });
  }

  function handleContextsSave(contextIds: string[]) {
    updateField.mutate({ id: taskId_, context_ids: contextIds });
  }

  function handleTagsSave(tagIds: string[]) {
    updateField.mutate({ id: taskId_, tag_ids: tagIds });
  }

  function handleEstimateSave(value: number | null) {
    updateField.mutate({ id: taskId_, estimated_minutes: value });
  }

  function handleRecurrenceSave(rule: string | null) {
    if (!rule) {
      removeRecurrence.mutate({ id: taskId_ });
    } else {
      setRecurrence.mutate({ id: taskId_, rule, anchor: "due_date" });
    }
  }

  function handleTitleSave(value: string | null) {
    if (!value?.trim()) return;
    updateField.mutate({ id: taskId_, title: value.trim() });
  }

  function handleFollowUpSave(iso: string | null) {
    if (!iso) return;
    recordFollowUp.mutate({ id: taskId_, follow_up_date: new Date(iso).toISOString() });
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
          <Link
            href="/m/tasks"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
            aria-label="Back to tasks"
          >
            <ChevronLeft size={22} />
          </Link>
          <h1 className="flex-1 truncate font-ui text-base font-semibold text-text-primary">
            Task
          </h1>
          {task.flagged && (
            <Flag size={16} className="mr-2 shrink-0 fill-accent-warning text-accent-warning" />
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-border-subtle px-4 py-4">
            <h2
              className={cn(
                "font-ui text-xl font-semibold leading-snug",
                isCompleted ? "text-text-tertiary line-through" : "text-text-primary",
              )}
            >
              {task.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {task.is_someday && (
                <span className="flex items-center gap-1 rounded-sm bg-surface-raised px-2 py-0.5 font-ui text-xs text-text-secondary">
                  <Clock size={10} aria-hidden />
                  Someday
                </span>
              )}
              {task.delegated_to_text && (
                <span className="flex items-center gap-1 rounded-sm bg-surface-raised px-2 py-0.5 font-ui text-xs text-text-secondary">
                  <Users size={10} aria-hidden />
                  {task.delegated_to_text}
                </span>
              )}
              {task.source_capture && (
                <Link
                  href={`/m/captures`}
                  className="flex items-center gap-1 rounded-sm bg-accent-primary/10 px-2 py-0.5 font-ui text-xs text-accent-primary"
                  title={task.source_capture.raw_text}
                >
                  <Sparkles size={10} aria-hidden />
                  {task.source_capture.ai_parsed ? "AI captured" : "From capture"}
                </Link>
              )}
            </div>
          </div>

          <div className="border-b border-border-subtle px-4 py-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isCompleted) uncomplete.mutate({ id: task.id });
                  else complete.mutate({ id: task.id });
                }}
                disabled={complete.isPending || uncomplete.isPending}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border font-ui text-sm font-medium transition-colors",
                  isCompleted
                    ? "border-border-default bg-surface-raised text-text-secondary"
                    : "border-accent-success bg-accent-success/10 text-accent-success",
                )}
              >
                <CheckCircle2 size={16} aria-hidden />
                {isCompleted ? "Reopen" : "Done"}
              </button>

              <button
                type="button"
                onClick={() => flag.mutate({ id: task.id, flagged: !task.flagged })}
                disabled={flag.isPending}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors",
                  task.flagged
                    ? "border-accent-warning bg-accent-warning/10 text-accent-warning"
                    : "border-border-subtle bg-surface-raised text-text-secondary",
                )}
                aria-label={task.flagged ? "Unflag" : "Flag"}
              >
                <Flag size={16} aria-hidden />
              </button>

              <button
                type="button"
                onClick={() => setActivePicker("title")}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border-subtle bg-surface-raised text-text-secondary active:bg-surface-hover"
                aria-label="Edit title"
              >
                <Pencil size={16} aria-hidden />
              </button>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            {task.notes ? (
              <section>
                <p className="mb-1 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  Notes
                </p>
                <p className="whitespace-pre-wrap font-ui text-sm leading-relaxed text-text-secondary">
                  {task.notes}
                </p>
              </section>
            ) : null}

            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setActivePicker("project")}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <FolderOpen size={14} aria-hidden />
                  Project
                </span>
                <span className={cn("flex items-center gap-1 font-ui text-sm font-medium", task.project ? "text-text-primary" : "text-text-disabled")}>
                  {task.project ? task.project.title : "None"}
                  <ChevronRight size={14} className="text-text-disabled" aria-hidden />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePicker("due")}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <Calendar size={14} aria-hidden />
                  Due date
                </span>
                <span className={cn("font-ui text-sm font-medium", dueDate ? "text-text-primary" : "text-text-disabled")}>
                  {dueDate ? localeFormatDate(dueDate, locale) : "None"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePicker("defer")}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <Clock size={14} aria-hidden />
                  Defer until
                </span>
                <span className={cn("font-ui text-sm font-medium", deferDate ? "text-text-primary" : "text-text-disabled")}>
                  {deferDate ? localeFormatDate(deferDate, locale) : "None"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSomeDayToggle}
                disabled={updateField.isPending}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover disabled:opacity-40"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <Clock size={14} aria-hidden />
                  Someday
                </span>
                <span
                  className={cn(
                    "flex h-6 w-11 items-center rounded-full transition-colors",
                    task.is_someday ? "bg-accent-primary" : "bg-border-default",
                  )}
                  role="switch"
                  aria-checked={task.is_someday ?? false}
                >
                  <span
                    className={cn(
                      "ml-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      task.is_someday ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePicker("waiting_for")}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <Users size={14} aria-hidden />
                  Waiting for
                </span>
                <span className={cn("flex items-center gap-1 font-ui text-sm font-medium", task.delegated_to_text ? "text-text-primary" : "text-text-disabled")}>
                  {task.delegated_to_text ?? "None"}
                  <ChevronRight size={14} className="text-text-disabled" aria-hidden />
                </span>
              </button>

              {task.delegated_to_text && (
                <button
                  type="button"
                  onClick={() => setActivePicker("follow_up_date")}
                  className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
                >
                  <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                    <Calendar size={14} aria-hidden />
                    Follow-up date
                  </span>
                  <span className={cn("flex items-center gap-1 font-ui text-sm font-medium", task.follow_up_date ? "text-text-primary" : "text-text-disabled")}>
                    {task.follow_up_date ? localeFormatDate(new Date(task.follow_up_date as string), locale) : "None"}
                    <ChevronRight size={14} className="text-text-disabled" aria-hidden />
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActivePicker("estimated_minutes")}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <Clock size={14} aria-hidden />
                  Estimate
                </span>
                <span className={cn("flex items-center gap-1 font-ui text-sm font-medium", task.estimated_minutes ? "text-text-primary" : "text-text-disabled")}>
                  {task.estimated_minutes
                    ? task.estimated_minutes < 60
                      ? `${task.estimated_minutes} min`
                      : `${Math.round((task.estimated_minutes / 60) * 10) / 10} hr`
                    : "None"}
                  <ChevronRight size={14} className="text-text-disabled" aria-hidden />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePicker("recurrence")}
                className="flex w-full items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left active:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
                  <RefreshCw size={14} aria-hidden />
                  Recurrence
                </span>
                <span className={cn("flex items-center gap-1 font-ui text-sm font-medium", recurrence ? "text-text-primary" : "text-text-disabled")}>
                  {recurrence ?? "None"}
                  <ChevronRight size={14} className="text-text-disabled" aria-hidden />
                </span>
              </button>

              {completedAt && isCompleted ? (
                <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
                  <span className="font-ui text-sm text-text-secondary">Completed</span>
                  <span className="font-ui text-sm font-medium text-text-primary">
                    {format(completedAt, "MMM d, yyyy")}
                  </span>
                </div>
              ) : null}
            </section>

            <section>
              <button
                type="button"
                onClick={() => setActivePicker("contexts")}
                className="mb-1.5 flex w-full items-center justify-between"
              >
                <p className="font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  Contexts
                </p>
                <span className="flex items-center gap-0.5 font-ui text-xs text-accent-primary">
                  Edit
                  <ChevronRight size={11} aria-hidden />
                </span>
              </button>
              {task.contexts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {task.contexts.map((ct) => (
                    <span
                      key={ct.context.id}
                      className="rounded-full bg-accent-info-muted px-3 py-1 font-ui text-sm text-accent-info"
                    >
                      @{ct.context.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="font-ui text-sm text-text-disabled">None</p>
              )}
            </section>

            <section>
              <button
                type="button"
                onClick={() => setActivePicker("tags")}
                className="mb-1.5 flex w-full items-center justify-between"
              >
                <p className="font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  Tags
                </p>
                <span className="flex items-center gap-0.5 font-ui text-xs text-accent-primary">
                  Edit
                  <ChevronRight size={11} aria-hidden />
                </span>
              </button>
              {task.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map((tg) => (
                    <span
                      key={tg.tag.id}
                      className="rounded-full border border-border-subtle px-3 py-1 font-ui text-sm text-text-secondary"
                    >
                      #{tg.tag.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="font-ui text-sm text-text-disabled">None</p>
              )}
            </section>

            <Link
              href={`/tasks?taskId=${task.id}`}
              onClick={setDesktopPreference}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-raised font-ui text-sm text-text-secondary active:bg-surface-hover"
            >
              <Monitor size={16} aria-hidden />
              Edit all fields on desktop
            </Link>
          </div>
        </div>
      </div>

      {activePicker === "due" && (
        <DatePickerSheet
          label="Due date"
          value={task.due_date}
          onSave={handleDueSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "defer" && (
        <DatePickerSheet
          label="Defer until"
          value={task.defer_date}
          onSave={handleDeferSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "project" && (
        <ProjectPickerSheet
          currentProjectId={task.project_id}
          onSave={handleProjectSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "waiting_for" && (
        <TextInputSheet
          label="Waiting for"
          placeholder="Person or team…"
          value={task.delegated_to_text ?? ""}
          onSave={handleWaitingForSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "contexts" && (
        <ContextPickerSheet
          currentContextIds={task.contexts.map((c) => c.context.id)}
          onSave={handleContextsSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "tags" && (
        <TagPickerSheet
          currentTagIds={task.tags.map((t) => t.tag.id)}
          onSave={handleTagsSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "title" && (
        <TextInputSheet
          label="Edit title"
          value={task.title}
          onSave={handleTitleSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "estimated_minutes" && (
        <EstimatePickerSheet
          current={task.estimated_minutes}
          onSave={handleEstimateSave}
          onClose={() => setActivePicker(null)}
          isPending={updateField.isPending}
        />
      )}

      {activePicker === "recurrence" && (
        <RecurrencePickerSheet
          current={task.recurrence_rule}
          onSave={handleRecurrenceSave}
          onClose={() => setActivePicker(null)}
          isPending={setRecurrence.isPending || removeRecurrence.isPending}
        />
      )}

      {activePicker === "follow_up_date" && (
        <DatePickerSheet
          label="Follow-up date"
          value={task.follow_up_date}
          onSave={handleFollowUpSave}
          onClose={() => setActivePicker(null)}
          isPending={recordFollowUp.isPending}
        />
      )}
    </>
  );
}

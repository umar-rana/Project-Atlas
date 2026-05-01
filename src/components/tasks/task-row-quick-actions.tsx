"use client";

import * as React from "react";
import {
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  Clock,
  FolderOpen,
  MoreHorizontal,
  Search,
  Plus,
  Check,
} from "lucide-react";
import {
  addDays,
  addWeeks,
  nextFriday,
  nextMonday,
  startOfDay,
  isFriday,
  isMonday,
} from "date-fns";
import { formatWeekdayAbbrev } from "@/core/locale/formatters";
import { useLocale } from "@/core/locale/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { useTasksStore } from "@/lib/tasks/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecurrenceQuickPopover } from "./recurrence-quick-popover";
import type { TaskRow } from "./task-list";

interface TaskRowQuickActionsProps {
  task: TaskRow;
  onAnyPopoverOpenChange: (open: boolean) => void;
  autoFocusFirstButton?: boolean;
  onDismiss?: () => void;
}

const TASK_LIST_QUERY_KEY = [["tasks", "list"]];

function buildDateOptions() {
  const today = startOfDay(new Date());
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "This Friday", date: isFriday(today) ? addDays(today, 7) : nextFriday(today) },
    { label: "Next Monday", date: isMonday(today) ? addDays(today, 7) : nextMonday(today) },
    { label: "In a week", date: addWeeks(today, 1) },
  ];
}

function optimisticallyUpdateTask(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  patch: Partial<TaskRow>,
): Array<[readonly unknown[], unknown]> {
  const prevSnapshots = queryClient.getQueriesData<TaskRow[]>({ queryKey: TASK_LIST_QUERY_KEY });
  queryClient.setQueriesData<TaskRow[]>({ queryKey: TASK_LIST_QUERY_KEY }, (old) =>
    old?.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) ?? old,
  );
  return prevSnapshots as Array<[readonly unknown[], unknown]>;
}

function restoreQuerySnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: Array<[readonly unknown[], unknown]>,
) {
  for (const [key, data] of snapshots) {
    queryClient.setQueryData(key as unknown[], data);
  }
}

interface QuickDatePopoverProps {
  taskId: string;
  field: "due_date" | "defer_date";
  currentValue: Date | string | null;
  onOpenChange: (open: boolean) => void;
}

function QuickDatePopover({
  taskId,
  field,
  currentValue,
  onOpenChange,
}: QuickDatePopoverProps) {
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [customVal, setCustomVal] = React.useState("");
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const prevSnapshots = React.useRef<Array<[readonly unknown[], unknown]>>([]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange(next);
    if (!next) setShowCustom(false);
  }

  const update = trpc.tasks.update.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: TASK_LIST_QUERY_KEY });
      const newVal = field === "due_date" ? vars.due_date : vars.defer_date;
      const coerced = newVal instanceof Date ? newVal : newVal ? new Date(newVal as string) : null;
      prevSnapshots.current = optimisticallyUpdateTask(queryClient, taskId, {
        [field]: coerced,
      });
    },
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      handleOpenChange(false);
    },
    onError: () => {
      restoreQuerySnapshots(queryClient, prevSnapshots.current);
      toast.error(`Failed to update ${field === "due_date" ? "due" : "defer"} date`);
    },
  });

  const dateOptions = buildDateOptions();
  const isDue = field === "due_date";
  const icon = isDue ? <CalendarDays size={12} /> : <Clock size={12} />;
  const label = isDue ? "Set due date" : "Set defer date";

  function applyDate(date: Date | null) {
    update.mutate({ id: taskId, [field]: date });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
        {dateOptions.map((opt) => (
          <button
            key={opt.label}
            type="button"
            disabled={update.isPending}
            onClick={() => applyDate(opt.date)}
            className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-sm text-text-primary hover:bg-accent-primary-subtle disabled:opacity-50"
          >
            <span>{opt.label}</span>
            <span className="text-xs text-text-tertiary">{formatWeekdayAbbrev(opt.date, locale.language)}</span>
          </button>
        ))}
        {showCustom ? (
          <div className="px-2 py-1">
            <input
              autoFocus
              type="date"
              value={customVal}
              onChange={(e) => {
                setCustomVal(e.target.value);
                if (e.target.value) {
                  applyDate(new Date(e.target.value + "T00:00:00"));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowCustom(false);
              }}
              className="w-full rounded-sm border border-border-default bg-surface-base px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-border-focus"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="w-full rounded-sm px-2 py-1 text-left text-sm text-text-tertiary hover:bg-accent-primary-subtle"
          >
            Custom date…
          </button>
        )}
        {currentValue && (
          <>
            <div className="-mx-1 my-1 h-px bg-border-subtle" />
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => applyDate(null)}
              className="w-full rounded-sm px-2 py-1 text-left text-sm text-accent-danger hover:bg-accent-danger-muted disabled:opacity-50"
            >
              {isDue ? "Remove due date" : "Remove defer date"}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ProjectPickerPopoverProps {
  taskId: string;
  currentProjectId: string | null;
  onOpenChange: (open: boolean) => void;
}

function ProjectPickerPopover({
  taskId,
  currentProjectId,
  onOpenChange,
}: ProjectPickerPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const prevSnapshots = React.useRef<Array<[readonly unknown[], unknown]>>([]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange(next);
    if (!next) setSearch("");
  }

  const projectsQuery = trpc.projects.list.useQuery(
    { status: "active" },
    { staleTime: 60_000, enabled: open },
  );

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (newProject) => {
      update.mutate({ id: taskId, project_id: newProject.id });
    },
    onError: () => toast.error("Failed to create project"),
  });

  const update = trpc.tasks.update.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: TASK_LIST_QUERY_KEY });
      prevSnapshots.current = optimisticallyUpdateTask(queryClient, taskId, {
        project_id: vars.project_id ?? null,
      });
    },
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      handleOpenChange(false);
    },
    onError: () => {
      restoreQuerySnapshots(queryClient, prevSnapshots.current);
      toast.error("Failed to move task");
    },
  });

  const projects = projectsQuery.data ?? [];
  const filtered = search
    ? projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const showCreateNew =
    search.trim().length > 0 &&
    !filtered.some((p) => p.title.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Move to project"
          title="Move to project"
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <FolderOpen size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1" onClick={(e) => e.stopPropagation()}>
        <div className="relative mb-1">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            autoFocus
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-sm border border-border-default bg-surface-base py-1 pl-6 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-border-focus"
          />
        </div>
        <div className="max-h-48 overflow-y-auto">
          <button
            type="button"
            disabled={update.isPending || currentProjectId === null}
            onClick={() => update.mutate({ id: taskId, project_id: null })}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent-primary-subtle disabled:opacity-50",
              currentProjectId === null ? "font-medium text-accent-primary" : "text-text-secondary",
            )}
          >
            {currentProjectId === null && <Check size={10} className="shrink-0" />}
            Inbox
          </button>
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={update.isPending || p.id === currentProjectId}
              onClick={() => update.mutate({ id: taskId, project_id: p.id })}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent-primary-subtle disabled:opacity-50",
                p.id === currentProjectId ? "font-medium text-accent-primary" : "text-text-primary",
              )}
            >
              {p.id === currentProjectId && <Check size={10} className="shrink-0" />}
              <span className="truncate">{p.title}</span>
            </button>
          ))}
          {filtered.length === 0 && !showCreateNew && search && (
            <p className="px-2 py-1 text-sm text-text-disabled">No projects found</p>
          )}
        </div>
        <div className="-mx-1 my-1 h-px bg-border-subtle" />
        {showCreateNew ? (
          <button
            type="button"
            disabled={createProject.isPending || update.isPending}
            onClick={() => createProject.mutate({ title: search.trim() })}
            className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm text-accent-info hover:bg-accent-primary-subtle disabled:opacity-50"
          >
            <Plus size={10} />
            {`Create "${search.trim()}"`}
          </button>
        ) : (
          <p className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-disabled">
            <Plus size={10} className="shrink-0" />
            Type a name to create a project
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface MoreMenuProps {
  task: TaskRow;
  onOpenInspector: () => void;
  onOpenChange: (open: boolean) => void;
}

function MoreMenu({ task, onOpenInspector, onOpenChange }: MoreMenuProps) {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const prevSnapshots = React.useRef<Array<[readonly unknown[], unknown]>>([]);

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      toast.success("Task duplicated");
    },
    onError: () => toast.error("Failed to duplicate task"),
  });

  const del = trpc.tasks.delete.useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TASK_LIST_QUERY_KEY });
      prevSnapshots.current = queryClient.getQueriesData<TaskRow[]>({
        queryKey: TASK_LIST_QUERY_KEY,
      }) as Array<[readonly unknown[], unknown]>;
      queryClient.setQueriesData<TaskRow[]>({ queryKey: TASK_LIST_QUERY_KEY }, (old) =>
        old?.filter((t) => t.id !== task.id) ?? old,
      );
    },
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
    onError: () => {
      restoreQuerySnapshots(queryClient, prevSnapshots.current);
      toast.error("Failed to move task to trash");
    },
  });

  function handleDuplicate() {
    create.mutate({
      title: task.title,
      notes: task.notes ?? undefined,
      project_id: task.project_id ?? undefined,
      parent_id: task.parent_id ?? undefined,
      flagged: task.flagged,
      defer_date: task.defer_date ? new Date(task.defer_date) : undefined,
      due_date: task.due_date ? new Date(task.due_date) : undefined,
      estimated_minutes: task.estimated_minutes ?? undefined,
      context_ids: task.contexts.map((c) => c.context.id),
      tag_ids: task.tags.map((tg) => tg.tag.id),
    });
  }

  function handleCopyLink() {
    const url = `${window.location.origin}${window.location.pathname}?taskId=${task.id}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Failed to copy link"),
    );
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          title="More actions"
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <MoreHorizontal size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpenInspector}>Open inspector</DropdownMenuItem>
        <DropdownMenuItem disabled={create.isPending} onSelect={handleDuplicate}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCopyLink}>Copy link</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={del.isPending}
          onSelect={() => del.mutate({ id: task.id })}
        >
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface MoveToDateButtonProps {
  taskId: string;
  label: string;
  date: Date;
  icon: React.ReactNode;
}

function MoveToDateButton({ taskId, label, date, icon }: MoveToDateButtonProps) {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const prevSnapshots = React.useRef<Array<[readonly unknown[], unknown]>>([]);

  const update = trpc.tasks.update.useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TASK_LIST_QUERY_KEY });
      prevSnapshots.current = optimisticallyUpdateTask(queryClient, taskId, {
        due_date: date,
        defer_date: null,
      });
    },
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
    onError: () => {
      restoreQuerySnapshots(queryClient, prevSnapshots.current);
      toast.error(`Failed to set due date`);
    },
  });

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={update.isPending}
      onClick={(e) => {
        e.stopPropagation();
        update.mutate({ id: taskId, due_date: date, defer_date: null });
      }}
      className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
    >
      {icon}
    </button>
  );
}

export function TaskRowQuickActions({
  task,
  onAnyPopoverOpenChange,
  autoFocusFirstButton,
  onDismiss,
}: TaskRowQuickActionsProps) {
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const openCount = React.useRef(0);
  const onAnyPopoverOpenChangeRef = React.useRef(onAnyPopoverOpenChange);
  onAnyPopoverOpenChangeRef.current = onAnyPopoverOpenChange;

  const handleChildOpenChange = React.useCallback((open: boolean) => {
    openCount.current = Math.max(0, openCount.current + (open ? 1 : -1));
    onAnyPopoverOpenChangeRef.current(openCount.current > 0);
  }, []);

  React.useEffect(() => {
    return () => {
      if (openCount.current > 0) {
        onAnyPopoverOpenChangeRef.current(false);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!autoFocusFirstButton) return;
    const container = containerRef.current;
    if (!container) return;
    const first = container.querySelector<HTMLButtonElement>("button");
    first?.focus();
  }, [autoFocusFirstButton]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const current = document.activeElement;
    const idx = buttons.indexOf(current as HTMLButtonElement);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      const next = idx < 0 ? buttons[0] : buttons[(idx + 1) % buttons.length];
      next?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      const prev = idx < 0 ? buttons[buttons.length - 1] : buttons[(idx - 1 + buttons.length) % buttons.length];
      prev?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDismiss?.();
    }
  }

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Quick actions"
      className="flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <MoveToDateButton
        taskId={task.id}
        label="Due today"
        date={today}
        icon={<CalendarCheck size={12} />}
      />
      <MoveToDateButton
        taskId={task.id}
        label="Due tomorrow"
        date={tomorrow}
        icon={<CalendarPlus size={12} />}
      />
      <QuickDatePopover
        taskId={task.id}
        field="due_date"
        currentValue={task.due_date}
        onOpenChange={handleChildOpenChange}
      />
      <QuickDatePopover
        taskId={task.id}
        field="defer_date"
        currentValue={task.defer_date}
        onOpenChange={handleChildOpenChange}
      />
      <ProjectPickerPopover
        taskId={task.id}
        currentProjectId={task.project_id}
        onOpenChange={handleChildOpenChange}
      />
      <RecurrenceQuickPopover
        taskId={task.id}
        hasRule={Boolean(task.recurrence_rule)}
        showAlways
        onOpenChange={handleChildOpenChange}
        onOpenCustom={() => setSelectedTaskId(task.id)}
      />
      <MoreMenu
        task={task}
        onOpenInspector={() => setSelectedTaskId(task.id)}
        onOpenChange={handleChildOpenChange}
      />
    </div>
  );
}

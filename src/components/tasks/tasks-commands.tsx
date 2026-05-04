"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  CheckSquare,
  Inbox,
  CalendarDays,
  Flag,
  Folder,
  Trash2,
  Plus,
  CalendarRange,
  CheckCircle2,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import {
  useRegisterCommands,
  useRegisterSearchProvider,
  type CommandItem,
} from "@/core/commands/registry";
import { useRegisterShortcuts, type ShortcutItem } from "@/core/shortcuts/registry";
import { useShellStore } from "@/lib/shell/store";
import { useTasksStore } from "@/lib/tasks/store";
import { trpc } from "@/lib/trpc/client";

/**
 * TasksCommands — registers task-scoped commands, the search provider, and
 * the in-list keyboard shortcuts (J/K/F/Space/⌘D/⌘I/⌘N/⌘⇧N/⌘1–7).
 *
 * Mounted from AppShellProvider so the registrations are global.
 */
export function TasksCommands(): null {
  const router = useRouter();
  const pathname = usePathname();
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const utils = trpc.useUtils();
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);

  const inTasks = pathname?.startsWith("/tasks");
  const projects = trpc.projects.list.useQuery({ status: "active" }, { enabled: Boolean(inTasks) });

  const projectMutation = trpc.projects.create.useMutation({
    onSuccess: (p) => {
      utils.projects.list.invalidate();
      router.push(`/tasks/projects/${p.id}`);
    },
  });

  const folderMutation = trpc.folders.create.useMutation({
    onSuccess: (f) => {
      utils.folders.list.invalidate();
      router.push(`/tasks/folders/${f.id}`);
    },
  });

  const folderMutateRef = React.useRef(folderMutation.mutate);
  folderMutateRef.current = folderMutation.mutate;

  // ── Static commands ─────────────────────────────────────────────────────
  useRegisterCommands(
    React.useMemo<CommandItem[]>(
      () => [
        {
          id: "tasks-go-inbox",
          label: "Tasks: Go to Inbox",
          group: "Tasks",
          icon: <Inbox size={14} />,
          shortcut: ["⌘", "1"],
          onRun: () => router.push("/tasks/inbox"),
        },
        {
          id: "tasks-go-today",
          label: "Tasks: Go to Today",
          group: "Tasks",
          icon: <CalendarDays size={14} />,
          shortcut: ["⌘", "2"],
          onRun: () => router.push("/tasks/today"),
        },
        {
          id: "tasks-go-flagged",
          label: "Tasks: Go to Flagged",
          group: "Tasks",
          icon: <Flag size={14} />,
          shortcut: ["⌘", "3"],
          onRun: () => router.push("/tasks/flagged"),
        },
        {
          id: "tasks-go-projects",
          label: "Tasks: Browse Projects",
          group: "Tasks",
          icon: <Folder size={14} />,
          shortcut: ["⌘", "4"],
          onRun: () => router.push("/tasks/projects"),
        },
        {
          id: "tasks-go-forecast",
          label: "Tasks: Go to Forecast",
          group: "Tasks",
          icon: <CalendarRange size={14} />,
          shortcut: ["⌘", "⇧", "F"],
          onRun: () => router.push("/tasks/forecast"),
        },
        {
          id: "tasks-go-review",
          label: "Tasks: Start Review Session",
          group: "Tasks",
          icon: <RefreshCw size={14} />,
          shortcut: ["⌘", "⇧", "R"],
          onRun: () => router.push("/tasks/review"),
        },
        {
          id: "tasks-go-completed",
          label: "Tasks: Go to Completed",
          group: "Tasks",
          icon: <CheckCircle2 size={14} />,
          onRun: () => router.push("/tasks/completed"),
        },
        {
          id: "tasks-go-trash",
          label: "Tasks: Open Trash",
          group: "Tasks",
          icon: <Trash2 size={14} />,
          shortcut: ["⌘", "7"],
          onRun: () => router.push("/tasks/trash"),
        },
        {
          id: "tasks-add-folder",
          label: "Tasks: Add Folder",
          group: "Tasks",
          icon: <Folder size={14} />,
          onRun: () => {
            const name = window.prompt("Folder name")?.trim();
            if (!name) return;
            folderMutateRef.current({ name });
          },
        },
        {
          id: "tasks-quick-capture",
          label: "Capture new task",
          group: "Tasks",
          icon: <Plus size={14} />,
          shortcut: ["⌘", "N"],
          onRun: () => setCaptureModalOpen(true),
        },
        {
          id: "tasks-new-project",
          label: "New project",
          group: "Tasks",
          icon: <Folder size={14} />,
          shortcut: ["⌘", "⇧", "N"],
          onRun: () => {
            const title = window.prompt("Project title");
            if (!title?.trim()) return;
            projectMutation.mutate({ title: title.trim(), color: "blue", status: "active" });
          },
        },
      ],
      [router, setCaptureModalOpen, projectMutation],
    ),
  );

  // ── Cheat-sheet entries (Tasks group) ──────────────────────────────────
  // Registered globally so the keyboard-shortcuts overlay shows them
  // alongside the Wave 2 navigation entries.
  useRegisterShortcuts(
    React.useMemo<ShortcutItem[]>(
      () => [
        { id: "t-inbox",     label: "Tasks: Inbox",        group: "Navigation", keys: ["cmd", "1"] },
        { id: "t-today",     label: "Tasks: Today",        group: "Navigation", keys: ["cmd", "2"] },
        { id: "t-flagged",   label: "Tasks: Flagged",      group: "Navigation", keys: ["cmd", "3"] },
        { id: "t-projects",  label: "Tasks: Projects",     group: "Navigation", keys: ["cmd", "4"] },
        { id: "t-trash",     label: "Tasks: Trash",        group: "Navigation", keys: ["cmd", "7"] },
        { id: "t-forecast",  label: "Tasks: Forecast",     group: "Navigation", keys: ["cmd", "shift", "F"] },
        { id: "t-review",    label: "Tasks: Review session", group: "Navigation", keys: ["cmd", "shift", "R"] },
        { id: "t-capture",   label: "Capture new task",    group: "Global",     keys: ["cmd", "N"] },
        { id: "t-newproj",   label: "New project",         group: "Global",     keys: ["cmd", "shift", "N"] },
        { id: "t-down",      label: "Move focus down",                   group: "Task list", keys: ["J"] },
        { id: "t-up",        label: "Move focus up",                     group: "Task list", keys: ["K"] },
        { id: "t-complete",  label: "Toggle complete (focused row)",     group: "Task list", keys: ["space"] },
        { id: "t-completd",  label: "Toggle complete (focused row)",     group: "Task list", keys: ["cmd", "D"] },
        { id: "t-flag",      label: "Flag/unflag (focused row)",         group: "Task list", keys: ["F"] },
        { id: "t-quickact",  label: "Quick actions (focused row)",       group: "Task list", keys: ["."] },
        { id: "t-enter",     label: "Open inspector (focused row)",      group: "Task list", keys: ["↵"] },
        { id: "t-inspect",   label: "Open inspector (focused row)",      group: "Inspector", keys: ["cmd", "I"] },
        { id: "t-process",   label: "Process Inbox",                     group: "Global",     keys: ["cmd", "shift", "P"] },
      ],
      [],
    ),
  );

  const markForReviewMutation = trpc.review.markForReview.useMutation({
    onSuccess: () => {
      utils.review.overdueCount.invalidate();
      utils.review.queue.invalidate();
      utils.projects.list.invalidate();
    },
  });
  const markForReviewRef = React.useRef(markForReviewMutation.mutate);
  markForReviewRef.current = markForReviewMutation.mutate;

  // ── Project navigation commands (dynamic) ──────────────────────────────
  const projectCommands = React.useMemo<CommandItem[]>(() => {
    const list = projects.data ?? [];
    return list.slice(0, 20).map((p) => ({
      id: `tasks-go-project-${p.id}`,
      label: `Project: ${p.title}`,
      group: "Projects",
      icon: <Folder size={14} />,
      onRun: () => router.push(`/tasks/projects/${p.id}`),
    }));
  }, [projects.data, router]);
  useRegisterCommands(projectCommands);

  // ── Mark project for review commands (dynamic) ─────────────────────────
  const markForReviewCommands = React.useMemo<CommandItem[]>(() => {
    const list = projects.data ?? [];
    return list.slice(0, 20).map((p) => ({
      id: `tasks-mark-review-${p.id}`,
      label: `Mark for review: ${p.title}`,
      group: "Projects",
      icon: <ClipboardList size={14} />,
      onRun: () => markForReviewRef.current({ id: p.id }),
    }));
  }, [projects.data]);
  useRegisterCommands(markForReviewCommands);

  // ── Search provider ────────────────────────────────────────────────────
  const searchProvider = React.useMemo(
    () => ({
      id: "tasks-search",
      search: async (query: string): Promise<CommandItem[]> => {
        const q = query.trim();
        if (!q) return [];
        const results = await utils.client.search.tasks.query({ query: q, limit: 12 });
        return results.map((r) => ({
          id: `task-search-${r.id}`,
          label: r.title,
          group: r.project_title ? `Project: ${r.project_title}` : "Tasks",
          icon: <CheckSquare size={14} />,
          onRun: () => {
            // Route to the task's most-relevant perspective.
            let dest = "/tasks/inbox";
            if (r.perspective === "project" && r.project_id) {
              dest = `/tasks/projects/${r.project_id}`;
            } else if (r.perspective === "flagged") {
              dest = "/tasks/flagged";
            } else if (r.perspective === "today") {
              dest = "/tasks/today";
            }
            router.push(dest);
            setTimeout(() => setSelectedTaskId(r.id), 50);
          },
        }));
      },
    }),
    [utils, router, setSelectedTaskId],
  );
  useRegisterSearchProvider(searchProvider);

  // ── ⌘1..7 perspective jumps ────────────────────────────────────────────
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Require ⌘/Ctrl and avoid clobbering ⌘⇧N etc.
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      // Don't hijack typing in form fields.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const map: Record<string, string> = {
        "1": "/tasks/inbox",
        "2": "/tasks/today",
        "3": "/tasks/flagged",
        "4": "/tasks/projects",
        "7": "/tasks/trash",
      };
      // ⌘⇧F → Forecast, ⌘⇧R → Review
      if (e.shiftKey) {
        const shiftMap: Record<string, string> = {
          "f": "/tasks/forecast",
          "F": "/tasks/forecast",
          "r": "/tasks/review",
          "R": "/tasks/review",
        };
        const shiftDest = shiftMap[e.key];
        if (shiftDest) {
          e.preventDefault();
          router.push(shiftDest);
          return;
        }
      }
      const dest = map[e.key];
      if (dest) {
        e.preventDefault();
        router.push(dest);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}

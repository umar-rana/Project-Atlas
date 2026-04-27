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
          id: "tasks-go-trash",
          label: "Tasks: Open Trash",
          group: "Tasks",
          icon: <Trash2 size={14} />,
          shortcut: ["⌘", "7"],
          onRun: () => router.push("/tasks/trash"),
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
        { id: "t-inbox",     label: "Tasks: Inbox",        group: "Tasks", keys: ["cmd", "1"] },
        { id: "t-today",     label: "Tasks: Today",        group: "Tasks", keys: ["cmd", "2"] },
        { id: "t-flagged",   label: "Tasks: Flagged",      group: "Tasks", keys: ["cmd", "3"] },
        { id: "t-projects",  label: "Tasks: Projects",     group: "Tasks", keys: ["cmd", "4"] },
        { id: "t-trash",     label: "Tasks: Trash",        group: "Tasks", keys: ["cmd", "7"] },
        { id: "t-capture",   label: "Capture new task",    group: "Tasks", keys: ["cmd", "N"] },
        { id: "t-newproj",   label: "New project",         group: "Tasks", keys: ["cmd", "shift", "N"] },
        { id: "t-complete",  label: "Toggle complete (focused row)",     group: "Tasks", keys: ["space"] },
        { id: "t-completd",  label: "Toggle complete (focused row)",     group: "Tasks", keys: ["cmd", "D"] },
        { id: "t-flag",      label: "Flag/unflag (focused row)",         group: "Tasks", keys: ["F"] },
        { id: "t-down",      label: "Move focus down",                   group: "Tasks", keys: ["J"] },
        { id: "t-up",        label: "Move focus up",                     group: "Tasks", keys: ["K"] },
        { id: "t-inspect",   label: "Open inspector for focused row",    group: "Tasks", keys: ["cmd", "I"] },
      ],
      [],
    ),
  );

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
